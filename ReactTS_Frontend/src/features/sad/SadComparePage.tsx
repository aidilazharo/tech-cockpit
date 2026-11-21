import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { PageMessage } from '../../components/qi'
import { ApiError } from '../../lib/api'
import { BackLink } from '../trm/parts'
import { type AnswerContext, AnswerView } from './AnswerView'
import { compareRefs, type ComparedVersion } from './diagrams/compare'
import { DiagramChanges } from './diagrams/DiagramChanges'
import { appName, sectionAnswers } from './format'
import { retiredQuestions } from './logic'
import { NoLongerAsked } from './QuestionWarning'
import { useSadDiagrams, useSadTemplate, useSadVersion, useUploads } from './queries'
import type { Question, Template, Version } from './schemas'
import { useVersionLabel } from './version-label'

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * The questions whose answer (or TRM value) differs, and the diagrams that changed in the views each section shows,
 * in sections both versions let the reader view.
 */
function changes(template: Template, before: Version, after: Version, diagrams: { before: ComparedVersion; after: ComparedVersion }) {
  const hiddenInBoth = (key: string) => before.hidden.includes(key) && after.hidden.includes(key)
  return template.sections
    .map((section) => {
      const a = before.sections.find((s) => s.key === section.key)
      const b = after.sections.find((s) => s.key === section.key)
      if (!a?.readable || !b?.readable) return { section, questions: [] as Question[], diagrams: [] }
      const questions = section.groups
        .flatMap((group) => group.items)
        .filter((item): item is Question => item.type !== 'note' && !hiddenInBoth(item.key))
        .filter((question) => !same(a.answers?.[question.key], b.answers?.[question.key]) || (question.type === 'trm' && !same(before.trm?.values[question.source], after.trm?.values[question.source])))
      const retired = retiredQuestions(section, a.answers, b.answers).filter((question) => !same(a.answers?.[question.key], b.answers?.[question.key]))
      const refs = section.groups.flatMap((group) => group.diagrams ?? [])
      return { section, questions: [...questions, ...retired], diagrams: compareRefs(refs, diagrams.before, diagrams.after) }
    })
    .filter((entry) => entry.questions.length > 0 || entry.diagrams.length > 0)
}

/** /sad/compare?from=…&to=… — what changed between two versions of a SAD. */
export function SadComparePage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const fromId = params.get('from')
  const toId = params.get('to')
  // A link that does not name both versions compares nothing.
  if (!fromId || !toId) return <PageMessage variant="warning">{t('sad.version.notFound')}</PageMessage>
  return <Compare fromId={fromId} toId={toId} />
}

function Compare({ fromId, toId }: { fromId: string; toId: string }) {
  const { t } = useTranslation()
  const label = useVersionLabel()
  const before = useSadVersion(fromId)
  const after = useSadVersion(toId)
  // Each version's diagrams and files, as the reader sees them there.
  const beforeDiagrams = useSadDiagrams(fromId)
  const afterDiagrams = useSadDiagrams(toId)
  const beforeFiles = useUploads(fromId)
  const afterFiles = useUploads(toId)
  const template = useSadTemplate()
  const queries = [template, before, after, beforeDiagrams, afterDiagrams, beforeFiles, afterFiles]

  if ([before, after].some((query) => query.error instanceof ApiError && query.error.status === 404)) return <PageMessage variant="warning">{t('sad.version.notFound')}</PageMessage>
  if (queries.some((query) => query.isError)) return <LoadFailed onRetry={() => queries.forEach((query) => void query.refetch())} />
  if (!template.data || !before.data || !after.data || !beforeDiagrams.data || !afterDiagrams.data || !beforeFiles.data || !afterFiles.data) return <Loading />
  const from = before.data
  const to = after.data
  // A link may name versions of two SADs: only versions of one SAD are compared.
  if (from.application.id !== to.application.id) return <PageMessage variant="warning">{t('sad.compare.otherApplication')}</PageMessage>
  const context = (version: Version): AnswerContext => ({ trm: version.trm, retention: version.retention, namesHidden: version.namesHidden })
  const versions = {
    before: { label: label(from), slots: beforeDiagrams.data.items, apis: beforeDiagrams.data.apis, uploads: beforeFiles.data.items },
    after: { label: label(to), slots: afterDiagrams.data.items, apis: afterDiagrams.data.apis, uploads: afterFiles.data.items },
  }
  const changed = changes(template.data, from, to, versions)

  return (
    <>
      <BackLink to={`/sad/versions/${to.id}`}>{t('sad.compare.back', { label: label(to) })}</BackLink>
      <PageHeader title={t('sad.compare.title', { from: label(from), to: label(to) })} intro={appName(to.application)} />
      {changed.length === 0 ? (
        <PageMessage variant="informative">{t('sad.compare.none')}</PageMessage>
      ) : (
        changed.map(({ section, questions, diagrams }) => (
          <section key={section.key} aria-labelledby={`compare-${section.key}`} className="flex flex-col gap-3">
            <h2 id={`compare-${section.key}`} className="heading-2">
              {section.title}
            </h2>
            {questions.length > 0 && (
            <div role="region" aria-label={t('sad.compare.caption', { section: section.title })} tabIndex={0} className="overflow-x-auto rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t('sad.compare.caption', { section: section.title })}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-divider-default px-2 py-2 text-left">
                      {t('sad.compare.question')}
                    </th>
                    <th scope="col" className="border-b border-divider-default px-2 py-2 text-left">
                      {label(from)}
                    </th>
                    <th scope="col" className="border-b border-divider-default px-2 py-2 text-left">
                      {label(to)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((question) => (
                    <tr key={question.key}>
                      <th scope="row" className="border-b border-divider-subdued px-2 py-2 text-left align-top font-semibold">
                        {question.label}
                        {section.retired?.some((removed) => removed.key === question.key) && (
                          <>
                            {' '}
                            <NoLongerAsked />
                          </>
                        )}
                      </th>
                      <td className="border-b border-divider-subdued px-2 py-2 align-top">
                        <AnswerView question={question} answer={sectionAnswers(from, section.key)[question.key]} context={context(from)} />
                      </td>
                      <td className="border-b border-divider-subdued px-2 py-2 align-top">
                        <AnswerView question={question} answer={sectionAnswers(to, section.key)[question.key]} context={context(to)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            <DiagramChanges changes={diagrams} before={versions.before} after={versions.after} />
          </section>
        ))
      )}
    </>
  )
}
