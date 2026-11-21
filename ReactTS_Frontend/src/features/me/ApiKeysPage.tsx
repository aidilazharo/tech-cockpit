import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ConfirmDialog } from '../../components/page/ConfirmDialog'
import { PageHeader } from '../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, DataTable, Dialog, Dropdown, PageMessage, StatusIndicator, TextField, type DataTableColumn } from '../../components/qi'
import { formatDate, formatDateTime } from '../../lib/format'
import { useCreateApiKey, useMyApiKeys, useRevokeApiKey } from '../admin/queries'
import type { ApiKey } from '../admin/schemas'

const EXPIRY_DAYS = ['7', '30', '60', '90'] as const
const FORM_ID = 'create-api-key-form'

type KeyStatus = 'active' | 'expired' | 'revoked'

function keyStatus(key: ApiKey, now = Date.now()): KeyStatus {
  if (key.revokedAt) return 'revoked'
  return Date.parse(key.expiresAt) <= now ? 'expired' : 'active'
}

export function ApiKeysPage() {
  const { t } = useTranslation()
  const keys = useMyApiKeys()
  const revokeKey = useRevokeApiKey()
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  const columns: DataTableColumn<ApiKey>[] = [
    { id: 'name', header: t('apiKeys.colName'), accessor: (key) => key.name },
    { id: 'key', header: t('apiKeys.colKey'), cell: (key) => <code>{`${key.keyPrefix}…`}</code> },
    { id: 'created', header: t('apiKeys.colCreated'), accessor: (key) => formatDate(key.createdAt) },
    { id: 'expires', header: t('apiKeys.colExpires'), accessor: (key) => formatDate(key.expiresAt) },
    { id: 'lastUsed', header: t('apiKeys.colLastUsed'), accessor: (key) => formatDateTime(key.lastUsedAt) ?? t('apiKeys.never') },
    {
      id: 'status',
      header: t('apiKeys.colStatus'),
      cell: (key) => {
        const status = keyStatus(key)
        return <StatusIndicator tone={status === 'active' ? 'positive' : 'ended'}>{t(`status.${status}`)}</StatusIndicator>
      },
    },
    {
      id: 'actions',
      header: t('apiKeys.colActions'),
      cell: (key) =>
        keyStatus(key) === 'active' && (
          <Button variant="tertiary" aria-label={t('apiKeys.revokeLabel', { name: key.name })} onClick={() => setRevoking(key)}>
            {t('apiKeys.revoke')}
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader title={t('apiKeys.title')} intro={t('apiKeys.intro')} actions={<Button onClick={() => setCreating(true)}>{t('apiKeys.create')}</Button>} />
      {keys.isPending ? (
        <Loading />
      ) : keys.isError ? (
        <LoadFailed onRetry={() => void keys.refetch()} />
      ) : (
        <DataTable caption={t('apiKeys.caption')} hideCaption columns={columns} rows={keys.data.items} getRowId={(key) => key.id} emptyState={t('apiKeys.none')} />
      )}
      <CreateApiKeyDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => {
          setRevoking(null)
          revokeKey.reset()
        }}
        title={t('apiKeys.revokeTitle', { name: revoking?.name })}
        description={t('apiKeys.revokeBody')}
        confirmLabel={t('apiKeys.revoke')}
        onConfirm={() => revoking && revokeKey.mutate(revoking.id, { onSuccess: () => setRevoking(null) })}
        pending={revokeKey.isPending}
        error={revokeKey.error}
      />
    </>
  )
}

function CreateApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const createKey = useCreateApiKey()
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const schema = z.object({
    name: z.string().trim().min(1, t('apiKeys.errors.name')).max(100),
    expiresInDays: z.enum(EXPIRY_DAYS),
  })
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', expiresInDays: '30' as const } })

  const close = () => {
    form.reset()
    createKey.reset()
    setToken(null)
    setCopied(false)
    onOpenChange(false)
  }

  const submit = form.handleSubmit(async (values) => {
    const created = await createKey.mutateAsync({ name: values.name, expiresInDays: Number(values.expiresInDays) })
    setToken(created.token)
  })

  const copy = async (secret: string) => {
    await navigator.clipboard.writeText(secret)
    setCopied(true)
  }

  if (token) {
    // The secret is shown once; the user must confirm they stored it.
    return (
      <Dialog
        open={open}
        onClose={close}
        variant="alert"
        title={t('apiKeys.createdTitle')}
        description={t('apiKeys.createdBody')}
        actions={
          <>
            <Button variant="secondary" onClick={() => void copy(token)}>
              {t('apiKeys.copy')}
            </Button>
            <Button onClick={close}>{t('apiKeys.done')}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField label={t('apiKeys.token')} value={token} readOnly className="font-mono text-sm" onFocus={(event) => event.target.select()} />
          {copied && <PageMessage variant="success">{t('apiKeys.copied')}</PageMessage>}
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('apiKeys.createTitle')}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={createKey.isPending}>
            {t('apiKeys.create')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event).catch(() => undefined)} className="flex flex-col gap-4">
        <ActionFailed error={createKey.error} />
        <TextField label={t('apiKeys.name')} hint={t('apiKeys.nameHint')} error={form.formState.errors.name?.message} {...form.register('name')} />
        <Controller
          control={form.control}
          name="expiresInDays"
          render={({ field }) => (
            <Dropdown
              label={t('apiKeys.expiresIn')}
              value={field.value}
              onValueChange={field.onChange}
              options={EXPIRY_DAYS.map((days) => ({ value: days, label: t('apiKeys.days', { count: Number(days) }) }))}
            />
          )}
        />
      </form>
    </Dialog>
  )
}
