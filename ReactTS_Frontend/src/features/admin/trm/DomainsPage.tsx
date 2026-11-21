import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, StatusIndicator } from '../../../components/qi'
import { useCreateDomain, useCreateSubdomain, useDomains, useUpdateDomain, useUpdateSubdomain } from '../../trm/queries'
import type { Domain, Subdomain } from '../../trm/schemas'
import { NameDialog } from './NameDialog'

type Editing = { kind: 'add-domain' } | { kind: 'rename-domain'; domain: Domain } | { kind: 'add-sub'; domain: Domain } | { kind: 'rename-sub'; sub: Subdomain }

/** /admin/domains — domains and sub-domains (system admins and enterprise architects). */
export function DomainsPage() {
  const { t } = useTranslation()
  const domains = useDomains()
  const createDomain = useCreateDomain()
  const updateDomain = useUpdateDomain()
  const createSub = useCreateSubdomain()
  const updateSub = useUpdateSubdomain()
  const [editing, setEditing] = useState<Editing | null>(null)
  const close = () => {
    setEditing(null)
    for (const mutation of [createDomain, updateDomain, createSub, updateSub]) mutation.reset()
  }
  const status = (active: boolean) => (active ? <StatusIndicator tone="positive">{t('status.active')}</StatusIndicator> : <StatusIndicator tone="ended">{t('portfolios.inactive')}</StatusIndicator>)

  return (
    <>
      <PageHeader title={t('trm.domains.title')} intro={t('trm.domains.intro')} actions={<Button onClick={() => setEditing({ kind: 'add-domain' })}>{t('trm.domains.add')}</Button>} />
      {domains.isPending ? (
        <Loading />
      ) : domains.isError ? (
        <LoadFailed onRetry={() => void domains.refetch()} />
      ) : domains.data.items.length === 0 ? (
        <p className="text-text-subdued">{t('trm.domains.none')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {domains.data.items.map((domain) => (
            <li key={domain.id}>
              <section aria-label={domain.name} className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="heading-3">{domain.name}</h2>
                  {status(domain.active)}
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button variant="tertiary" aria-label={t('trm.domains.addSubLabel', { name: domain.name })} onClick={() => setEditing({ kind: 'add-sub', domain })}>
                      {t('trm.domains.addSub')}
                    </Button>
                    <Button variant="tertiary" aria-label={t('portfolios.renameLabel', { name: domain.name })} onClick={() => setEditing({ kind: 'rename-domain', domain })}>
                      {t('portfolios.rename')}
                    </Button>
                    <Button
                      variant="tertiary"
                      aria-label={t(domain.active ? 'portfolios.deactivateLabel' : 'portfolios.reactivateLabel', { name: domain.name })}
                      onClick={() => updateDomain.mutate({ id: domain.id, active: !domain.active, version: domain.version })}
                    >
                      {domain.active ? t('portfolios.deactivate') : t('portfolios.reactivate')}
                    </Button>
                  </div>
                </div>
                {domain.subdomains.length === 0 ? (
                  <p className="text-sm text-text-subdued">{t('trm.landscape.noSubdomains')}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-divider-default">
                    {domain.subdomains.map((sub) => (
                      <li key={sub.id} className="flex flex-wrap items-center gap-3 py-2">
                        <span className="font-semibold">{sub.name}</span>
                        {status(sub.active)}
                        <span className="text-sm text-text-subdued">{t('trm.capabilities.applications', { count: sub.applicationCount })}</span>
                        <div className="ml-auto flex flex-wrap gap-2">
                          <Button variant="tertiary" aria-label={t('portfolios.renameLabel', { name: `${domain.name} / ${sub.name}` })} onClick={() => setEditing({ kind: 'rename-sub', sub })}>
                            {t('portfolios.rename')}
                          </Button>
                          <Button
                            variant="tertiary"
                            aria-label={t(sub.active ? 'portfolios.deactivateLabel' : 'portfolios.reactivateLabel', { name: `${domain.name} / ${sub.name}` })}
                            onClick={() => updateSub.mutate({ id: sub.id, active: !sub.active, version: sub.version })}
                          >
                            {sub.active ? t('portfolios.deactivate') : t('portfolios.reactivate')}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </li>
          ))}
        </ul>
      )}
      {editing?.kind === 'add-domain' && (
        <NameDialog title={t('trm.domains.add')} submitLabel={t('trm.domains.add')} pending={createDomain.isPending} error={createDomain.error} onSave={(name) => createDomain.mutate(name, { onSuccess: close })} onClose={close} />
      )}
      {editing?.kind === 'rename-domain' && (
        <NameDialog
          title={t('portfolios.renameLabel', { name: editing.domain.name })}
          initial={editing.domain.name}
          submitLabel={t('common.save')}
          pending={updateDomain.isPending}
          error={updateDomain.error}
          onSave={(name) => updateDomain.mutate({ id: editing.domain.id, name, version: editing.domain.version }, { onSuccess: close })}
          onClose={close}
        />
      )}
      {editing?.kind === 'add-sub' && (
        <NameDialog
          title={t('trm.domains.addSubLabel', { name: editing.domain.name })}
          submitLabel={t('trm.domains.addSub')}
          pending={createSub.isPending}
          error={createSub.error}
          onSave={(name) => createSub.mutate({ domainId: editing.domain.id, name }, { onSuccess: close })}
          onClose={close}
        />
      )}
      {editing?.kind === 'rename-sub' && (
        <NameDialog
          title={t('portfolios.renameLabel', { name: editing.sub.name })}
          initial={editing.sub.name}
          submitLabel={t('common.save')}
          pending={updateSub.isPending}
          error={updateSub.error}
          onSave={(name) => updateSub.mutate({ id: editing.sub.id, name, version: editing.sub.version }, { onSuccess: close })}
          onClose={close}
        />
      )}
    </>
  )
}
