import { useTranslation } from 'react-i18next'
import { appName } from './format'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader } from '../../components/page/PageHeader'
import { ActionFailed } from '../../components/page/QueryStates'
import { Button, ButtonLink, PageMessage, StatusIndicator } from '../../components/qi'
import { formatDate } from '../../lib/format'
import { BackLink, DetailStates, Section } from '../trm/parts'
import { LocalAuthFlag } from './LocalAuthFlag'
import { useSadOverview, useStartDraft } from './queries'
import type { Overview } from './schemas'

function Content({ overview }: { overview: Overview }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const start = useStartDraft(overview.application.id)
  const name = appName(overview.application)
  const { open, current } = overview

  return (
    <>
      <BackLink to="/sad">{t('sad.list.title')}</BackLink>
      <PageHeader
        title={t('sad.document.title', { name })}
        intro={overview.application.number ? t('sad.document.apmId', { number: overview.application.number }) : undefined}
        actions={
          overview.canStartDraft ? (
            <Button loading={start.isPending} onClick={() => start.mutate(undefined, { onSuccess: (draft) => void navigate(`/sad/versions/${draft.id}/edit`) })}>
              {current ? t('sad.document.startVersion', { number: current.number + 1 }) : t('sad.document.startFirst')}
            </Button>
          ) : undefined
        }
      />
      {overview.localAuthentication && <LocalAuthFlag from={overview.localAuthentication} />}
      <ActionFailed error={start.error} />

      <Section id="sad-current" title={t('sad.document.current')}>
        {current ? (
          <div className="flex flex-wrap items-center gap-3">
            <span>{t('sad.document.currentVersion', { number: current.number, date: formatDate(current.approvedAt) })}</span>
            <ButtonLink to={`/sad/versions/${current.versionId}`} variant="secondary">
              {t('sad.document.read', { number: current.number })}
            </ButtonLink>
          </div>
        ) : (
          <p className="text-text-subdued">{t('sad.document.noCurrent')}</p>
        )}
      </Section>

      <Section id="sad-open" title={t('sad.document.open')}>
        {open ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusIndicator tone={open.status === 'draft' ? 'informative' : 'attention'}>{t(`sad.status.${open.status}`)}</StatusIndicator>
              <span>{t('sad.document.draftOf', { number: open.draftOf })}</span>
              <span className="text-text-subdued">
                {open.startedBy ? t('sad.document.startedBy', { name: open.startedBy.name, date: formatDate(open.startedAt) }) : t('sad.document.startedOn', { date: formatDate(open.startedAt) })}
              </span>
            </div>
            {open.approvalStatus === 'returned' && <PageMessage variant="warning">{t('sad.version.returned')}</PageMessage>}
            <div className="flex flex-wrap gap-3">
              <ButtonLink to={`/sad/versions/${open.versionId}`} variant="secondary">
                {t('sad.document.openDraft')}
              </ButtonLink>
              {open.status === 'draft' && overview.editable.length > 0 && <ButtonLink to={`/sad/versions/${open.versionId}/edit`}>{t('sad.document.edit')}</ButtonLink>}
            </div>
          </div>
        ) : (
          <p className="text-text-subdued">{t('sad.document.noOpen')}</p>
        )}
      </Section>

      <Section id="sad-history" title={t('sad.document.history')}>
        {overview.history.length === 0 ? (
          <p className="text-text-subdued">{t('sad.document.noHistory')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {overview.history.map((version) => (
              <li key={version.versionId} className="flex flex-wrap items-center gap-3">
                <Link to={`/sad/versions/${version.versionId}`} className="font-semibold text-text-link underline">
                  {t('sad.document.versionN', { number: version.number })}
                </Link>
                <span className="text-text-subdued">{t('sad.document.approvedOn', { date: formatDate(version.approvedAt) })}</span>
                <StatusIndicator tone={version.status === 'current' ? 'positive' : 'ended'}>{t(`sad.status.${version.status}`)}</StatusIndicator>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  )
}

/** /sad/:applicationId — an application's SAD: the version in force, the open draft and the history. */
export function SadDocumentPage() {
  const { t } = useTranslation()
  const { applicationId = '' } = useParams()
  const overview = useSadOverview(applicationId)
  return (
    <DetailStates query={overview} notFound={t('sad.document.notFound')}>
      {(data) => <Content overview={data} />}
    </DetailStates>
  )
}
