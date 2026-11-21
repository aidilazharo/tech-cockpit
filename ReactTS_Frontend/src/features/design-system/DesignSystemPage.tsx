import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Avatar,
  Button,
  Checkbox,
  DatePicker,
  DataTable,
  Dialog,
  Dropdown,
  Menu,
  MenuItem,
  MenuRadioGroup,
  MenuSeparator,
  PageMessage,
  Pagination,
  SearchSelect,
  StatusIndicator,
  Tabs,
  Tag,
  Textarea,
  TextField,
  type DataTableColumn,
} from '../../components/qi'
import { ChevronDownIcon } from '../../components/qi/icons'
import { useDateLabels } from '../../components/page/useDateLabels'

const OWNERS = [
  { id: 'o1', name: 'Ana Lim', email: 'ana.lim@aia.com' },
  { id: 'o2', name: 'Rajesh Kumar', email: 'rajesh.kumar@aia.com' },
  { id: 'o3', name: 'Siti Aisyah', email: 'siti.aisyah@aia.com' },
]
import { formatMyr } from '../../lib/format'
import { ThemeSwitcher } from '../../theme/ThemeSwitcher'

interface SampleApplication {
  id: string
  name: string
  owner: string
  criticality: number
  /** Decimal string; null = the user may not see this financial value. */
  annualCost: string | null
}

const SAMPLE_APPLICATIONS: SampleApplication[] = [
  { id: 'app-1', name: 'Policy Administration', owner: 'Core Insurance', criticality: 1, annualCost: '1250000.00' },
  { id: 'app-2', name: 'Agent Portal', owner: 'Digital', criticality: 2, annualCost: null },
  { id: 'app-3', name: 'Claims Hub', owner: 'Core Insurance', criticality: 1, annualCost: '845000.50' },
]

const AMOUNT = /^\d+(\.\d{1,2})?$/

/** Living gallery of the Qi component library; also the first Playwright target. */
export function DesignSystemPage() {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tco, setTco] = useState('')
  const [tcoTouched, setTcoTouched] = useState(false)
  const [portfolio, setPortfolio] = useState<string | null>(null)
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [notify, setNotify] = useState({ approvals: true, reports: false })
  const [examplePage, setExamplePage] = useState(4)
  const dateLabels = useDateLabels()
  const [goLive, setGoLive] = useState<string | null>(null)
  const [ownerQuery, setOwnerQuery] = useState('')
  const [owner, setOwner] = useState<(typeof OWNERS)[number] | null>(null)
  const [section, setSection] = useState<'summary' | 'costs' | 'risks'>('summary')

  const tcoError = tcoTouched && tco !== '' && !AMOUNT.test(tco) ? t('designSystem.tcoError') : undefined

  const columns: DataTableColumn<SampleApplication>[] = [
    { id: 'name', header: t('designSystem.colApplication'), accessor: (row) => row.name, sortable: true },
    { id: 'owner', header: t('designSystem.colOwner'), accessor: (row) => row.owner, sortable: true },
    {
      id: 'criticality',
      header: t('designSystem.colCriticality'),
      accessor: (row) => row.criticality,
      sortable: true,
      cell: (row) => t('designSystem.tier', { tier: row.criticality }),
    },
    {
      id: 'annualCost',
      header: t('designSystem.colAnnualCost'),
      cell: (row) =>
        row.annualCost === null ? (
          <span className="text-text-subdued italic">{t('common.restricted')}</span>
        ) : (
          formatMyr(row.annualCost)
        ),
    },
  ]

  return (
    <div className="min-h-dvh bg-surface-default text-text-default">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-divider-default px-4 py-4 md:px-8">
        <p className="text-lg font-bold">
          <span className="text-text-link">AIA</span> TechCockpit
        </p>
        <div className="w-48">
          <ThemeSwitcher />
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 md:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="heading-1">{t('designSystem.title')}</h1>
          <p className="text-text-subdued">{t('designSystem.intro')}</p>
        </div>

        <section aria-labelledby="ds-buttons" className="flex flex-col gap-4">
          <h2 id="ds-buttons" className="heading-3">
            {t('designSystem.buttons')}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button>{t('designSystem.primary')}</Button>
            <Button variant="secondary">{t('designSystem.secondary')}</Button>
            <Button variant="tertiary">{t('designSystem.tertiary')}</Button>
            <Button disabled>{t('designSystem.disabled')}</Button>
            <Button loading>{t('designSystem.loading')}</Button>
          </div>
        </section>

        <section aria-labelledby="ds-forms" className="flex flex-col gap-4">
          <h2 id="ds-forms" className="heading-3">
            {t('designSystem.forms')}
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <TextField label={t('designSystem.projectName')} hint={t('designSystem.projectNameHint')} />
            <TextField
              label={t('designSystem.tco')}
              inputMode="decimal"
              value={tco}
              onChange={(event) => setTco(event.target.value)}
              onBlur={() => setTcoTouched(true)}
              error={tcoError}
            />
            <TextField label={t('designSystem.remarks')} labelSuffix={t('designSystem.optional')} />
            <Dropdown
              label={t('designSystem.portfolio')}
              placeholder={t('designSystem.portfolioPlaceholder')}
              value={portfolio}
              onValueChange={setPortfolio}
              options={[
                { value: 'digital', label: t('designSystem.portfolioDigital') },
                { value: 'core', label: t('designSystem.portfolioCore') },
                { value: 'corporate', label: t('designSystem.portfolioCorporate') },
              ]}
            />
          </div>
        </section>

        <section aria-labelledby="ds-more-inputs" className="flex flex-col gap-4">
          <h2 id="ds-more-inputs" className="heading-3">
            {t('designSystem.moreInputs')}
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <DatePicker label={t('designSystem.datePickerLabel')} hint={t('designSystem.datePickerHint')} value={goLive} onChange={setGoLive} labels={dateLabels} />
            <SearchSelect
              label={t('designSystem.searchLabel')}
              placeholder={t('designSystem.searchPlaceholder')}
              value={owner}
              onValueChange={setOwner}
              items={OWNERS.filter((person) => person.name.toLowerCase().includes(ownerQuery.toLowerCase()))}
              onQueryChange={setOwnerQuery}
              itemKey={(person) => person.id}
              itemLabel={(person) => person.name}
              itemDescription={(person) => person.email}
              emptyText={t('designSystem.searchEmpty')}
            />
            <div className="md:col-span-2">
              <Textarea label={t('designSystem.textareaLabel')} labelSuffix={t('designSystem.optional')} />
            </div>
          </div>
        </section>

        <section aria-labelledby="ds-tabs" className="flex flex-col gap-4">
          <h2 id="ds-tabs" className="heading-3">
            {t('designSystem.tabs')}
          </h2>
          <Tabs<'summary' | 'costs' | 'risks'>
            label={t('designSystem.tabsLabel')}
            value={section}
            onValueChange={setSection}
            tabs={[
              { value: 'summary', label: t('designSystem.tabSummary') },
              { value: 'costs', label: t('designSystem.tabCosts') },
              { value: 'risks', label: t('designSystem.tabRisks'), count: 2 },
            ]}
          >
            <p>{t(`designSystem.tab${section[0].toUpperCase()}${section.slice(1)}Body`)}</p>
          </Tabs>
        </section>

        <section aria-labelledby="ds-messages" className="flex flex-col gap-4">
          <h2 id="ds-messages" className="heading-3">
            {t('designSystem.messages')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <PageMessage title={t('designSystem.messageInfoTitle')}>{t('designSystem.messageInfoBody')}</PageMessage>
            <PageMessage variant="success" title={t('designSystem.messageSuccessTitle')}>
              {t('designSystem.messageSuccessBody')}
            </PageMessage>
            <PageMessage variant="warning" title={t('designSystem.messageWarningTitle')}>
              {t('designSystem.messageWarningBody')}
            </PageMessage>
            <PageMessage variant="error" title={t('designSystem.messageErrorTitle')}>
              {t('designSystem.messageErrorBody')}
            </PageMessage>
          </div>
        </section>

        <section aria-labelledby="ds-tags" className="flex flex-col gap-4">
          <h2 id="ds-tags" className="heading-3">
            {t('designSystem.tagsAndStatuses')}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Tag>{t('designSystem.tagDefault')}</Tag>
            <Tag emphasis="medium">{t('designSystem.tagMedium')}</Tag>
            <Tag emphasis="high">{t('designSystem.tagHigh')}</Tag>
            <Tag emphasis="new">{t('designSystem.tagNew')}</Tag>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <StatusIndicator tone="positive">{t('designSystem.statusPositive')}</StatusIndicator>
            <StatusIndicator tone="attention">{t('designSystem.statusAttention')}</StatusIndicator>
            <StatusIndicator tone="negative">{t('designSystem.statusNegative')}</StatusIndicator>
            <StatusIndicator tone="informative">{t('designSystem.statusInformative')}</StatusIndicator>
            <StatusIndicator tone="ended">{t('designSystem.statusEnded')}</StatusIndicator>
          </div>
        </section>

        <section aria-labelledby="ds-checkboxes" className="flex flex-col gap-4">
          <h2 id="ds-checkboxes" className="heading-3">
            {t('designSystem.checkboxes')}
          </h2>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 font-semibold">{t('designSystem.checkboxLegend')}</legend>
            <Checkbox
              label={t('designSystem.checkboxApprovals')}
              description={t('designSystem.checkboxApprovalsHint')}
              checked={notify.approvals}
              onCheckedChange={(approvals) => setNotify((current) => ({ ...current, approvals }))}
            />
            <Checkbox
              label={t('designSystem.checkboxReports')}
              checked={notify.reports}
              onCheckedChange={(reports) => setNotify((current) => ({ ...current, reports }))}
            />
            <Checkbox label={t('designSystem.checkboxLocked')} checked disabled onCheckedChange={() => {}} />
          </fieldset>
        </section>

        <section aria-labelledby="ds-pagination" className="flex flex-col gap-4">
          <h2 id="ds-pagination" className="heading-3">
            {t('designSystem.pagination')}
          </h2>
          <Pagination
            page={examplePage}
            pageCount={9}
            onPageChange={setExamplePage}
            labels={{ label: t('designSystem.paginationLabel'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </section>

        <section aria-labelledby="ds-avatars" className="flex flex-col gap-4">
          <h2 id="ds-avatars" className="heading-3">
            {t('designSystem.avatars')}
          </h2>
          <div className="flex flex-wrap items-center gap-3" aria-label={t('designSystem.avatarPeople')} role="group">
            <Avatar name="Ana Lim" size="sm" />
            <Avatar name="Rajesh Kumar" tone="secondary-2" />
            <Avatar name="Siti Aisyah" size="lg" tone="secondary-3" />
          </div>
        </section>

        <section aria-labelledby="ds-menus" className="flex flex-col gap-4">
          <h2 id="ds-menus" className="heading-3">
            {t('designSystem.menus')}
          </h2>
          <div>
            <Menu
              align="start"
              label={t('designSystem.menuTrigger')}
              trigger={
                <span className="flex items-center gap-1 px-2 font-semibold">
                  BC-1024 <ChevronDownIcon />
                </span>
              }
            >
              <MenuItem>{t('designSystem.menuView')}</MenuItem>
              <MenuItem>{t('designSystem.menuDuplicate')}</MenuItem>
              <MenuItem disabled>{t('designSystem.menuArchive')}</MenuItem>
              <MenuSeparator />
              <MenuRadioGroup
                label={t('designSystem.menuSort')}
                value={sort}
                onValueChange={setSort}
                options={[
                  { value: 'newest', label: t('designSystem.menuSortNewest') },
                  { value: 'oldest', label: t('designSystem.menuSortOldest') },
                ]}
              />
            </Menu>
          </div>
        </section>

        <section aria-labelledby="ds-dialogs" className="flex flex-col gap-4">
          <h2 id="ds-dialogs" className="heading-3">
            {t('designSystem.dialogs')}
          </h2>
          <div>
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              {t('designSystem.openDialog')}
            </Button>
          </div>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title={t('designSystem.dialogTitle')}
            description={t('designSystem.dialogDescription')}
            closeLabel={t('common.close')}
            actions={
              <>
                <Button variant="tertiary" onClick={() => setDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => setDialogOpen(false)}>{t('designSystem.dialogConfirm')}</Button>
              </>
            }
          />
        </section>

        <section aria-labelledby="ds-tables" className="flex flex-col gap-4">
          <h2 id="ds-tables" className="heading-3">
            {t('designSystem.tables')}
          </h2>
          <DataTable
            caption={t('designSystem.tableCaption')}
            columns={columns}
            rows={SAMPLE_APPLICATIONS}
            getRowId={(row) => row.id}
            striped
            emptyState={t('designSystem.noApplications')}
          />
        </section>
      </main>
    </div>
  )
}
