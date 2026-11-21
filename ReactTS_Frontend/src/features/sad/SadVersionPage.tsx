import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { appName, sectionAnswers } from './format'
import { Link, useNavigate, useParams } from 'react-router'
import { ConfirmDialog } from '../../components/page/ConfirmDialog'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, ButtonLink, PageMessage, StatusIndicator } from '../../components/qi'
import { formatDate } from '../../lib/format'
import { BackLink, DetailStates } from '../trm/parts'
import { useCan } from '../../auth/permissions'
import { SAD_ANY } from './permissions'
import { useCancelDraft, useSadDiagrams, useSadOverview, useSadTemplate, useSadVersion, useSubmitSad } from './queries'
import type { Template, Version } from './schemas'
import { SectionNav } from './SectionNav'
import { SectionView } from './SectionView'
import { VERSION_TONES } from './status'
import { useVersionLabel } from './version-label'
import { VersionHistory } from './VersionHistory'
import { LocalAuthFlag } from './LocalAuthFlag'

function Content({ version, template }: { version: Version; template: Template }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const label = useVersionLabel()
  const can = useCan()
  // Approvers without SAD permissions do not see the application's overview.
  const overview = useSadOverview(version.application.id, SAD_ANY.some(can))
  const current = overview.data?.current
  const submit = useSubmitSad(version.id)
  const diagrams = useSadDiagrams(version.id)
  const cancel = useCancelDraft(version.id)
  const [confirm, setConfirm] = useState<'submit' | 'cancel' | null>(null)
  const name = appName(version.application)
  const hidden = new Set(version.hidden)
  // The backup schedule's rows as the version keeps them.
  const context = { trm: version.trm, retention: version.retention, namesHidden: version.namesHidden }
  const editable = version.status === 'draft' && version.sections.some((section) => section.editable)
  const missing = version.completion.reduce((sum, c) => sum + (c.total - c.answered), 0)

  return (
    <>
      {version.asApprover && version.approvalInstanceId ? (
        // An approver may not open the application's SAD page: back to their approval instead.
        <BackLink to={`/approvals/${version.approvalInstanceId}`}>{t('sad.version.backToApproval')}</BackLink>
      ) : (
        <BackLink to={`/sad/${version.application.id}`}>{t('sad.document.title', { name })}</BackLink>
      )}
      <PageHeader
        title={`${name}: ${label(version)}`}
        intro={version.approvedAt ? t('sad.document.approvedOn', { date: formatDate(version.approvedAt) }) : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {editable && <ButtonLink to={`/sad/versions/${version.id}/edit`}>{t('sad.version.edit')}</ButtonLink>}
            {version.canSubmit && (
              <Button variant="secondary" onClick={() => setConfirm('submit')}>
                {t('sad.version.submit')}
              </Button>
            )}
            {current && current.versionId !== version.id && (
              <ButtonLink to={`/sad/compare?from=${current.versionId}&to=${version.id}`} variant="secondary">
                {t('sad.version.compare', { number: current.number })}
              </ButtonLink>
            )}
            <ButtonLink to={`/api/v1/sad/versions/${version.id}/pdf`} reloadDocument variant="secondary">
              {t('sad.version.pdf')}
            </ButtonLink>
            {version.canCancel && (
              <Button variant="tertiary" onClick={() => setConfirm('cancel')}>
                {t('sad.version.cancel')}
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <StatusIndicator tone={VERSION_TONES[version.status]}>{t(`sad.status.${version.status}`)}</StatusIndicator>
        {version.localAuthentication && <LocalAuthFlag />}
        {version.status === 'draft' && <span className="text-text-subdued">{missing > 0 ? t('sad.toAnswer', { count: missing }) : version.sections.every((s) => s.readable) ? t('sad.version.readyToSubmit') : t('sad.version.viewableAnswered')}</span>}
      </div>
      {version.asApprover && <PageMessage variant="informative">{t('sad.version.asApprover')}</PageMessage>}
      {version.approvalStatus === 'returned' && version.status === 'draft' && <PageMessage variant="warning">{t('sad.version.returned')}</PageMessage>}
      {version.approvalInstanceId && (
        <p>
          <Link to={`/approvals/${version.approvalInstanceId}`} className="font-semibold text-text-link underline">
            {t('sad.version.approval')}
          </Link>
        </p>
      )}
      {version.trm && !version.trm.live && <p className="text-sm text-text-subdued">{t('sad.version.snapshot')}</p>}
      {version.namesHidden && <p className="text-sm text-text-subdued">{t('sad.version.namesHidden')}</p>}
      <VersionHistory version={version} />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SectionNav template={template} version={version} current={null} to={(key) => `#section-${key}`} />
        </aside>
        <div className="flex min-w-0 flex-col gap-10">
          {template.sections
            .filter((section) => version.sections.find((s) => s.key === section.key)?.readable)
            .map((section) => (
              <SectionView key={section.key} section={section} answers={sectionAnswers(version, section.key)} hidden={hidden} context={context} diagrams={{ template, slots: diagrams.data?.items, apis: diagrams.data?.apis, applicationId: version.application.id, versionId: version.id, load: { failed: diagrams.isError, retry: () => void diagrams.refetch() } }} />
            ))}
          {version.sections.some((section) => !section.readable) && <p className="text-sm text-text-subdued">{t('sad.version.someHidden')}</p>}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'submit'}
        onClose={() => {
          setConfirm(null)
          submit.reset()
        }}
        title={t('sad.version.submitTitle', { label: label(version) })}
        description={version.approvalStatus === 'returned' ? t('sad.version.resubmitIntro') : t('sad.version.submitIntro')}
        confirmLabel={t('sad.version.submit')}
        pending={submit.isPending}
        error={submit.error}
        onConfirm={() => submit.mutate(undefined, { onSuccess: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onClose={() => {
          setConfirm(null)
          cancel.reset()
        }}
        title={t('sad.version.cancelTitle')}
        description={t('sad.version.cancelIntro')}
        confirmLabel={t('sad.version.cancel')}
        pending={cancel.isPending}
        error={cancel.error}
        onConfirm={() => cancel.mutate(undefined, { onSuccess: () => void navigate(`/sad/${version.application.id}`) })}
      />
    </>
  )
}

/** /sad/versions/:versionId — a version, read-only, with the sections the reader may view. */
export function SadVersionPage() {
  const { t } = useTranslation()
  const { versionId = '' } = useParams()
  const version = useSadVersion(versionId)
  const template = useSadTemplate()
  if (template.isPending) return <Loading />
  if (template.isError) return <LoadFailed onRetry={() => void template.refetch()} />
  return (
    <DetailStates query={version} notFound={t('sad.version.notFound')}>
      {(data) => <Content version={data} template={template.data} />}
    </DetailStates>
  )
}
