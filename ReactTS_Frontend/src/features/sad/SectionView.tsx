import { useTranslation } from 'react-i18next'
import { type AnswerContext, AnswerView } from './AnswerView'
import { GroupDiagrams } from './diagrams/GroupDiagrams'
import { retiredQuestions, warningOf } from './logic'
import { NoLongerAsked, QuestionWarning } from './QuestionWarning'
import type { DiagramApi, DiagramSlotData, SectionAnswers, Template, TemplateSection } from './schemas'

/** A section's questions, answers and diagrams, read-only, without the questions that do not apply. */
export function SectionView({
  section,
  answers,
  hidden,
  context,
  diagrams,
}: {
  section: TemplateSection
  answers: SectionAnswers
  hidden: Set<string>
  context: AnswerContext
  /** The template and the slots the reader may see (diagrams are left out without them) */
  diagrams?: { template: Template; slots: DiagramSlotData[] | undefined; apis?: DiagramApi[]; applicationId?: string; versionId?: string; load?: { failed: boolean; retry: () => void } }
}) {
  const { t } = useTranslation()
  const retired = retiredQuestions(section, answers)
  return (
    <section id={`section-${section.key}`} aria-labelledby={`heading-${section.key}`} className="flex flex-col gap-4">
      <h2 id={`heading-${section.key}`} className="heading-2">
        {section.title}
      </h2>
      {section.intro && <p className="text-text-subdued">{section.intro}</p>}
      {section.groups.map((group) => {
        const questions = group.items.filter((item) => item.type !== 'note' && !hidden.has(item.key))
        const refs = diagrams ? (group.diagrams ?? []) : []
        if (questions.length === 0 && refs.length === 0) return null
        return (
          <div key={group.key} className="flex flex-col gap-3">
            {group.title && <h3 className="heading-3">{group.title}</h3>}
            {group.intro && <p>{group.intro}</p>}
            <dl className="flex flex-col gap-3">
              {group.items.map((item) =>
                item.type === 'note' ? (
                  <p key={item.key} className="text-sm text-text-subdued italic">
                    {item.text}
                  </p>
                ) : hidden.has(item.key) ? null : (
                  <div key={item.key} className="flex flex-col gap-1">
                    <dt className="font-semibold">{item.label}</dt>
                    <dd className="flex flex-col gap-2">
                      <AnswerView question={item} answer={answers[item.key]} context={context} />
                      <QuestionWarning text={warningOf(item, answers)} />
                    </dd>
                  </div>
                ),
              )}
            </dl>
            {diagrams && <GroupDiagrams refs={refs} section={section.key} template={diagrams.template} slots={diagrams.slots} apis={diagrams.apis} applicationId={diagrams.applicationId} versionId={diagrams.versionId} load={diagrams.load} />}
          </div>
        )
      })}
      {retired.length > 0 && (
        <dl className="flex flex-col gap-3">
          {retired.map((question) => (
            <div key={question.key} className="flex flex-col gap-1">
              <dt className="flex flex-wrap items-center gap-2 font-semibold">
                <span>{question.label}</span>
                <NoLongerAsked />
              </dt>
              <dd>
                <AnswerView question={question} answer={answers[question.key]} context={context} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {section.references.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{t('sad.references')}</span>
          <ul className="list-disc pl-6">
            {section.references.map((reference) => (
              <li key={reference}>{reference}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
