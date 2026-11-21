import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionFailed, Loading } from '../../components/page/QueryStates'
import { Button, Checkbox, Dialog } from '../../components/qi'
import { usePortfolios, useSetApplicationPortfolios } from './queries'
import type { Application } from './schemas'

/** System admins: an application belongs to none, one or several portfolios. */
export function PortfoliosDialog({ app, onClose }: { app: Application; onClose: () => void }) {
  const { t } = useTranslation()
  const portfolios = usePortfolios()
  const save = useSetApplicationPortfolios(app.id)
  const [chosen, setChosen] = useState(() => new Set(app.portfolios.map((p) => p.id)))
  const assigned = new Set(app.portfolios.map((p) => p.id))
  // Inactive portfolios stay on offer only while the application still has them.
  const offered = (portfolios.data?.items ?? []).filter((p) => p.active || assigned.has(p.id))

  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen)
    if (on) next.add(id)
    else next.delete(id)
    setChosen(next)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('trm.application.portfoliosTitle', { name: app.name ?? '' })}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(offered.map((p) => p.id).filter((id) => chosen.has(id)), { onSuccess: onClose })}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ActionFailed error={save.error} />
        {portfolios.isPending ? (
          <Loading />
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-text-subdued">{t('trm.application.portfoliosHint')}</legend>
            {offered.map((portfolio) => (
              <Checkbox
                key={portfolio.id}
                label={portfolio.active ? portfolio.name : t('trm.application.inactivePortfolio', { name: portfolio.name })}
                checked={chosen.has(portfolio.id)}
                onCheckedChange={(on) => toggle(portfolio.id, on)}
              />
            ))}
          </fieldset>
        )}
      </div>
    </Dialog>
  )
}
