import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionFailed, Loading } from '../../components/page/QueryStates'
import { Button, Checkbox, Dialog } from '../../components/qi'
import { useDomains, useSetApplicationSubdomains } from './queries'
import type { Application } from './schemas'

/** Place an application in sub-domains (several allowed). */
export function DomainsDialog({ app, onClose }: { app: Application; onClose: () => void }) {
  const { t } = useTranslation()
  const domains = useDomains()
  const save = useSetApplicationSubdomains(app.id)
  const assigned = new Set(app.subdomains.map((s) => s.id))
  const [chosen, setChosen] = useState(assigned)
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen)
    if (on) next.add(id)
    else next.delete(id)
    setChosen(next)
  }
  // Inactive sub-domains stay on offer only while the application is in them.
  const offered = (domains.data?.items ?? [])
    .map((domain) => ({ ...domain, subdomains: domain.subdomains.filter((sub) => (sub.active && domain.active) || assigned.has(sub.id)) }))
    .filter((domain) => domain.subdomains.length > 0)

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('trm.application.domainsTitle', { name: app.name ?? '' })}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(offered.flatMap((d) => d.subdomains.map((s) => s.id)).filter((id) => chosen.has(id)), { onSuccess: onClose })}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ActionFailed error={save.error} />
        {domains.isPending ? (
          <Loading />
        ) : offered.length === 0 ? (
          <p className="text-text-subdued">{t('trm.domains.none')}</p>
        ) : (
          offered.map((domain) => (
            <fieldset key={domain.id} className="flex flex-col gap-2">
              <legend className="mb-1 font-semibold">{domain.name}</legend>
              {domain.subdomains.map((sub) => (
                <Checkbox
                  key={sub.id}
                  label={sub.active && domain.active ? sub.name : t('trm.application.inactivePortfolio', { name: sub.name })}
                  checked={chosen.has(sub.id)}
                  onCheckedChange={(on) => toggle(sub.id, on)}
                />
              ))}
            </fieldset>
          ))
        )}
      </div>
    </Dialog>
  )
}
