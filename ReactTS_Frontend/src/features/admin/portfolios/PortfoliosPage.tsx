import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, DataTable, Dialog, StatusIndicator, TextField } from '../../../components/qi'
import { useCreatePortfolio, usePortfolios, useUpdatePortfolio } from '../../trm/queries'
import type { Portfolio } from '../../trm/schemas'

/** /admin/portfolios — the portfolio list (system admins). PMO adds streams later. */
export function PortfoliosPage() {
  const { t } = useTranslation()
  const portfolios = usePortfolios()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<Portfolio | null>(null)

  return (
    <>
      <PageHeader title={t('portfolios.title')} intro={t('portfolios.intro')} actions={<Button onClick={() => setAdding(true)}>{t('portfolios.add')}</Button>} />
      {portfolios.isPending ? (
        <Loading />
      ) : portfolios.isError ? (
        <LoadFailed onRetry={() => void portfolios.refetch()} />
      ) : (
        <DataTable
          caption={t('portfolios.caption')}
          hideCaption
          rows={portfolios.data.items}
          getRowId={(p) => p.id}
          emptyState={t('portfolios.none')}
          columns={[
            { id: 'name', header: t('portfolios.colName'), accessor: (p) => p.name },
            {
              id: 'status',
              header: t('portfolios.colStatus'),
              cell: (p) => (p.active ? <StatusIndicator tone="positive">{t('status.active')}</StatusIndicator> : <StatusIndicator tone="ended">{t('portfolios.inactive')}</StatusIndicator>),
            },
            { id: 'actions', header: t('portfolios.colActions'), cell: (p) => <PortfolioActions portfolio={p} onRename={() => setRenaming(p)} /> },
          ]}
        />
      )}
      {adding && <NameDialog onClose={() => setAdding(false)} />}
      {renaming && <NameDialog portfolio={renaming} onClose={() => setRenaming(null)} />}
    </>
  )
}

function PortfolioActions({ portfolio, onRename }: { portfolio: Portfolio; onRename: () => void }) {
  const { t } = useTranslation()
  const update = useUpdatePortfolio(portfolio.id)
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="tertiary" aria-label={t('portfolios.renameLabel', { name: portfolio.name })} onClick={onRename}>
        {t('portfolios.rename')}
      </Button>
      <Button
        variant="tertiary"
        loading={update.isPending}
        aria-label={t(portfolio.active ? 'portfolios.deactivateLabel' : 'portfolios.reactivateLabel', { name: portfolio.name })}
        onClick={() => update.mutate({ active: !portfolio.active, version: portfolio.version })}
      >
        {portfolio.active ? t('portfolios.deactivate') : t('portfolios.reactivate')}
      </Button>
    </div>
  )
}

/** Add a portfolio, or rename one. */
function NameDialog({ portfolio, onClose }: { portfolio?: Portfolio; onClose: () => void }) {
  const { t } = useTranslation()
  const create = useCreatePortfolio()
  const update = useUpdatePortfolio(portfolio?.id ?? '')
  const mutation = portfolio ? update : create
  const [name, setName] = useState(portfolio?.name ?? '')
  const [tried, setTried] = useState(false)
  const title = portfolio ? t('portfolios.renameLabel', { name: portfolio.name }) : t('portfolios.add')
  const save = () => {
    setTried(true)
    const value = name.trim()
    if (!value) return
    if (portfolio) update.mutate({ name: value, version: portfolio.version }, { onSuccess: onClose })
    else create.mutate(value, { onSuccess: onClose })
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={mutation.isPending} onClick={save}>
            {portfolio ? t('common.save') : t('portfolios.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ActionFailed error={mutation.error} />
        <TextField label={t('portfolios.name')} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} error={tried && !name.trim() ? t('portfolios.nameRequired') : undefined} />
      </div>
    </Dialog>
  )
}
