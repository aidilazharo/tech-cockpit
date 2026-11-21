import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, Checkbox, DataTable, Dialog, StatusIndicator, TextField, type DataTableColumn } from '../../../components/qi'
import { useCreateDepartment, useDepartments, useUpdateDepartment } from '../queries'
import type { Department } from '../schemas'

const FORM_ID = 'add-department-form'

export function DepartmentsPage() {
  const { t } = useTranslation()
  const departments = useDepartments()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)

  const columns: DataTableColumn<Department>[] = [
    { id: 'code', header: t('departments.colCode'), accessor: (d) => d.code, sortable: true },
    { id: 'name', header: t('departments.colName'), accessor: (d) => d.name, sortable: true },
    {
      id: 'status',
      header: t('departments.colStatus'),
      cell: (d) =>
        d.active ? <StatusIndicator tone="positive">{t('status.active')}</StatusIndicator> : <StatusIndicator tone="ended">{t('status.disabled')}</StatusIndicator>,
    },
    {
      id: 'actions',
      header: t('departments.colActions'),
      cell: (d) => (
        <Button variant="tertiary" aria-label={t('departments.editLabel', { name: d.name })} onClick={() => setEditing(d)}>
          {t('departments.edit')}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t('departments.title')} intro={t('departments.intro')} actions={<Button onClick={() => setAdding(true)}>{t('departments.add')}</Button>} />
      {departments.isPending ? (
        <Loading />
      ) : departments.isError ? (
        <LoadFailed onRetry={() => void departments.refetch()} />
      ) : (
        <DataTable
          caption={t('departments.caption')}
          hideCaption
          columns={columns}
          rows={departments.data.items}
          getRowId={(d) => d.id}
          emptyState={t('departments.none')}
        />
      )}
      <AddDepartmentDialog open={adding} onOpenChange={setAdding} />
      {editing && <EditDepartmentDialog department={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function EditDepartmentDialog({ department, onClose }: { department: Department; onClose: () => void }) {
  const { t } = useTranslation()
  const update = useUpdateDepartment()
  const [name, setName] = useState(department.name)
  const [active, setActive] = useState(department.active)
  const [tried, setTried] = useState(false)
  const nameError = tried && !name.trim() ? t('departments.errors.name') : undefined

  const submit = () => {
    setTried(true)
    if (!name.trim()) return
    update.mutate({ id: department.id, name: name.trim(), active, version: department.version }, { onSuccess: onClose })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('departments.editTitle', { name: department.name })}
      description={`${t('departments.code')}: ${department.code}`}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ActionFailed error={update.error} />
        <TextField label={t('departments.name')} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} error={nameError} />
        <Checkbox label={t('departments.active')} checked={active} onCheckedChange={setActive} />
      </div>
    </Dialog>
  )
}

function AddDepartmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const createDepartment = useCreateDepartment()
  const schema = z.object({
    code: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,49}$/, t('departments.errors.code'))),
    name: z.string().trim().min(1, t('departments.errors.name')).max(200),
  })
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { code: '', name: '' } })

  const close = () => {
    form.reset()
    createDepartment.reset()
    onOpenChange(false)
  }

  const submit = form.handleSubmit(async (values) => {
    await createDepartment.mutateAsync(values)
    close()
  })

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('departments.addTitle')}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={createDepartment.isPending}>
            {t('departments.add')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event).catch(() => undefined)} className="flex flex-col gap-4">
        <ActionFailed error={createDepartment.error} />
        <TextField label={t('departments.code')} hint={t('departments.codeHint')} error={form.formState.errors.code?.message} {...form.register('code')} />
        <TextField label={t('departments.name')} error={form.formState.errors.name?.message} {...form.register('name')} />
      </form>
    </Dialog>
  )
}
