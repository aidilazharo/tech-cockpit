import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '../../../auth/permissions'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { useDateLabels } from '../../../components/page/useDateLabels'
import { Button, ButtonLink, DataTable, DatePicker, Dialog, Pagination, StatusIndicator } from '../../../components/qi'
import { cn } from '../../../lib/cn'
import { toDisplayDate } from '../../../lib/dates'
import { ApplicationPicker } from '../ApplicationPicker'
import { useListParams } from '../list-params'
import { FilterDropdown, RecordLink, RefLinks, SearchField, Section } from '../parts'
import { PAGE_SIZE, useInitiatives, useLinkPlannedApplication, usePlannedApplications } from '../queries'
import { INITIATIVE_STATUSES, type PlannedApplication, ROADMAP_ACTIONS, type Ref } from '../schemas'
import { Timeline } from '../Timeline'
import { INITIATIVE_COLOURS, INITIATIVE_TONES } from './status'

/** /trm/roadmap — the EA roadmap: initiatives with exact dates, and planned applications. */
export function RoadmapPage() {
  const { t } = useTranslation()
  const dateLabels = useDateLabels()
  const canManage = useCan()('trm:roadmap:manage')
  const list = useListParams(['q', 'status', 'from', 'to'])
  const initiatives = useInitiatives(list.values, list.page)

  return (
    <>
      <PageHeader
        title={t('trm.roadmap.title')}
        intro={t('trm.roadmap.intro')}
        actions={
          canManage && (
            <ButtonLink to="/trm/roadmap/new">{t('trm.roadmap.new')}</ButtonLink>
          )
        }
      />
      <form role="search" aria-label={t('trm.filters')} onSubmit={(event) => event.preventDefault()} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SearchField label={t('trm.roadmap.search')} value={list.values.q} onSearch={(q) => list.set({ q })} />
        <FilterDropdown
          label={t('trm.roadmap.status')}
          anyLabel={t('trm.roadmap.anyStatus')}
          value={list.values.status}
          onChange={(status) => list.set({ status })}
          options={INITIATIVE_STATUSES.map((value) => ({ value, label: t(`trm.roadmap.statuses.${value}`) }))}
        />
        <DatePicker label={t('trm.roadmap.from')} value={list.values.from || null} onChange={(from) => list.set({ from: from ?? '' })} labels={dateLabels} />
        <DatePicker label={t('trm.roadmap.to')} value={list.values.to || null} onChange={(to) => list.set({ to: to ?? '' })} labels={dateLabels} />
        {list.filtered && (
          <div className="flex items-end">
            <Button variant="tertiary" onClick={list.clear}>
              {t('common.clear')}
            </Button>
          </div>
        )}
      </form>
      {initiatives.isPending ? (
        <Loading />
      ) : initiatives.isError ? (
        <LoadFailed onRetry={() => void initiatives.refetch()} />
      ) : (
        <>
          <DataTable
            caption={t('trm.roadmap.caption')}
            hideCaption
            rows={initiatives.data.items}
            getRowId={(i) => i.id}
            emptyState={t('trm.roadmap.none')}
            columns={[
              { id: 'name', header: t('trm.roadmap.colName'), cell: (i) => <RecordLink to={`/trm/roadmap/${i.id}`} name={i.name} /> },
              { id: 'status', header: t('trm.roadmap.status'), cell: (i) => <StatusIndicator tone={INITIATIVE_TONES[i.status]}>{t(`trm.roadmap.statuses.${i.status}`)}</StatusIndicator> },
              { id: 'start', header: t('trm.roadmap.start'), accessor: (i) => toDisplayDate(i.startDate) },
              { id: 'end', header: t('trm.roadmap.end'), accessor: (i) => toDisplayDate(i.endDate) },
              { id: 'owner', header: t('trm.roadmap.owner'), accessor: (i) => i.owner?.name ?? t('common.none') },
              {
                id: 'actions',
                header: t('trm.roadmap.applications'),
                accessor: (i) =>
                  ROADMAP_ACTIONS.filter((action) => i.actionCounts[action] > 0)
                    .map((action) => t('trm.roadmap.actionCount', { count: i.actionCounts[action], action: t(`trm.roadmap.actions.${action}`) }))
                    .join(' · ') || t('common.none'),
              },
            ]}
          />
          <Pagination
            page={list.page}
            pageCount={Math.ceil(initiatives.data.total / PAGE_SIZE)}
            onPageChange={(next) => list.set({ page: String(next) } as Partial<Record<'q' | 'status' | 'from' | 'to' | 'page', string>>)}
            labels={{ label: t('trm.roadmap.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
          {initiatives.data.items.length > 0 && (
            <Section id="trm-roadmap-timeline" title={t('trm.roadmap.timeline')}>
              <Timeline
                label={t('trm.roadmap.timeline')}
                legend={INITIATIVE_STATUSES.map((status) => ({ label: t(`trm.roadmap.statuses.${status}`), colour: INITIATIVE_COLOURS[status] }))}
                items={initiatives.data.items.map((i) => ({
                  id: i.id,
                  label: <RecordLink to={`/trm/roadmap/${i.id}`} name={i.name} />,
                  details: (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className={cn('size-2.5 rounded-sm', INITIATIVE_COLOURS[i.status])} />
                        {t(`trm.roadmap.statuses.${i.status}`)}
                      </span>
                      <span>{t('trm.roadmap.dates', { start: toDisplayDate(i.startDate), end: toDisplayDate(i.endDate) })}</span>
                    </>
                  ),
                  segments: [{ start: i.startDate, end: i.endDate, colour: INITIATIVE_COLOURS[i.status] }],
                }))}
              />
            </Section>
          )}
        </>
      )}
      <PlannedApplications canManage={canManage} />
    </>
  )
}

function PlannedApplications({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const planned = usePlannedApplications()
  const [linking, setLinking] = useState<PlannedApplication | null>(null)
  return (
    <Section id="trm-planned" title={t('trm.roadmap.planned')}>
      <p className="text-sm text-text-subdued">{t('trm.roadmap.plannedIntro')}</p>
      {planned.isPending ? (
        <Loading />
      ) : planned.isError ? (
        <LoadFailed onRetry={() => void planned.refetch()} />
      ) : (
        <DataTable
          caption={t('trm.roadmap.planned')}
          hideCaption
          rows={planned.data.items}
          getRowId={(p) => p.id}
          emptyState={t('trm.roadmap.noPlanned')}
          columns={[
            { id: 'name', header: t('trm.roadmap.colPlanned'), accessor: (p) => p.name },
            {
              id: 'linked',
              header: t('trm.roadmap.colLinked'),
              cell: (p) => (p.linkedApplication ? <RecordLink to={`/trm/applications/${p.linkedApplication.id}`} name={p.linkedApplication.name} /> : t('trm.roadmap.notLinked')),
            },
            { id: 'initiatives', header: t('trm.roadmap.colInitiatives'), cell: (p) => <RefLinks items={p.initiatives} to={(id) => `/trm/roadmap/${id}`} /> },
            ...(canManage
              ? [
                  {
                    id: 'link',
                    header: t('trm.roadmap.colLink'),
                    cell: (p: PlannedApplication) => (
                      <Button variant="tertiary" aria-label={t('trm.roadmap.linkLabel', { name: p.name })} onClick={() => setLinking(p)}>
                        {t('trm.roadmap.link')}
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
      {linking && <LinkDialog planned={linking} onClose={() => setLinking(null)} />}
    </Section>
  )
}

function LinkDialog({ planned, onClose }: { planned: PlannedApplication; onClose: () => void }) {
  const { t } = useTranslation()
  const link = useLinkPlannedApplication()
  const [application, setApplication] = useState<Ref | null>(planned.linkedApplication)
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('trm.roadmap.linkTitle', { name: planned.name })}
      description={t('trm.roadmap.linkIntro')}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={link.isPending} onClick={() => link.mutate({ id: planned.id, applicationId: application?.id ?? null }, { onSuccess: onClose })}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ActionFailed error={link.error} />
        <ApplicationPicker label={t('trm.roadmap.realApplication')} value={application} onChange={setApplication} />
      </div>
    </Dialog>
  )
}
