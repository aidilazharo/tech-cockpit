import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { ConfirmDialog } from '../../../components/page/ConfirmDialog'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, Checkbox, Dropdown, PageMessage, Tag, TextField } from '../../../components/qi'
import { useCan } from '../../../auth/permissions'
import { ApiError } from '../../../lib/api'
import { useCreateRole, useDeleteRole, usePermissions, useRole, useUpdateRole } from '../queries'
import { SadSectionGrid } from './SadSectionGrid'
import { DATA_ACCESS_LEVELS, DATA_CLASSES, type DataAccess, type Permission, type Role } from '../schemas'

const NO_ACCESS: DataAccess = { financial: 'none', contract: 'none', personal: 'none' }

/** /admin/roles/new and /admin/roles/:id */
export function RoleEditorPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const role = useRole(id)
  const permissions = usePermissions()

  return (
    <>
      <Link to="/admin/roles" className="w-fit text-sm font-semibold text-text-link underline underline-offset-4">
        {t('role.back')}
      </Link>
      {(id && role.isPending) || permissions.isPending ? (
        <Loading />
      ) : role.isError && role.error instanceof ApiError && role.error.status === 404 ? (
        <PageMessage variant="warning">{t('role.notFound')}</PageMessage>
      ) : role.isError || permissions.isError ? (
        <LoadFailed
          onRetry={() => {
            // Only what failed: refetch() would also run the disabled role query on /new.
            if (role.isError) void role.refetch()
            if (permissions.isError) void permissions.refetch()
          }}
        />
      ) : (
        <RoleForm key={role.data?.version ?? 'new'} role={role.data ?? null} catalogue={permissions.data.items} />
      )}
    </>
  )
}

function RoleForm({ role, catalogue }: { role: Role | null; catalogue: Permission[] }) {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const createRole = useCreateRole()
  const updateRole = useUpdateRole(role?.id ?? '')
  const deleteRole = useDeleteRole()
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const readOnly = !can('access:role:manage') || Boolean(role?.isSystemAdmin)
  const save = role ? updateRole : createRole

  const schema = z.object({
    name: z.string().trim().min(1, t('role.errors.name')).max(100),
    code: z.string().regex(/^[a-z][a-z0-9-]{1,49}$/, t('role.errors.code')),
    description: z.string().trim().max(500),
    permissions: z.array(z.string()),
    dataAccess: z.object({
      financial: z.enum(DATA_ACCESS_LEVELS),
      contract: z.enum(DATA_ACCESS_LEVELS),
      personal: z.enum(DATA_ACCESS_LEVELS),
    }),
    canActForStaff: z.boolean(),
  })
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: role?.name ?? '',
      code: role?.code ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
      dataAccess: role?.dataAccess ?? NO_ACCESS,
      canActForStaff: role?.canActForStaff ?? false,
    },
  })

  // Permission codes are <module>:<resource>:<action>; one section per module (Qi: section headers for long lists).
  const modules = new Map<string, Permission[]>()
  for (const permission of catalogue) {
    const module = permission.code.split(':')[0]
    modules.set(module, [...(modules.get(module) ?? []), permission])
  }

  const submit = form.handleSubmit(async (values) => {
    setSaved(false)
    if (role) {
      await updateRole.mutateAsync({
        name: values.name,
        description: values.description || null,
        permissions: values.permissions,
        dataAccess: values.dataAccess,
        canActForStaff: values.canActForStaff,
        version: role.version,
      })
      setSaved(true)
    } else {
      const created = await createRole.mutateAsync({ ...values, description: values.description || undefined })
      void navigate(`/admin/roles/${created.id}`, { replace: true })
    }
  })

  return (
    <form noValidate onSubmit={(event) => void submit(event).catch(() => undefined)} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="heading-1">{role?.name ?? t('role.newTitle')}</h1>
          {role?.isSystem && <Tag>{t('roles.system')}</Tag>}
        </div>
        {!readOnly && role && !role.isSystem && (
          <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
            {t('role.delete')}
          </Button>
        )}
      </div>

      {role?.isSystemAdmin ? (
        <PageMessage>{t('role.systemAdmin')}</PageMessage>
      ) : (
        readOnly && <PageMessage>{t('role.readOnly')}</PageMessage>
      )}
      {saved && <PageMessage variant="success">{t('role.saved')}</PageMessage>}
      <ActionFailed error={save.error} />

      <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-2">
        <TextField label={t('role.name')} error={form.formState.errors.name?.message} {...form.register('name')} />
        <TextField
          label={t('role.code')}
          hint={role ? undefined : t('role.codeHint')}
          disabled={Boolean(role) || readOnly}
          error={form.formState.errors.code?.message}
          {...form.register('code')}
        />
        <div className="md:col-span-2">
          <TextField label={t('role.description')} labelSuffix={t('common.optional')} {...form.register('description')} />
        </div>
        <div className="md:col-span-2">
          <Controller
            control={form.control}
            name="canActForStaff"
            render={({ field }) => (
              <Checkbox label={t('role.canActForStaff')} description={t('role.canActForStaffHint')} disabled={readOnly} checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
      </fieldset>

      <section aria-labelledby="role-data-access" className="flex flex-col gap-4">
        <h2 id="role-data-access" className="heading-3">
          {t('role.dataAccess')}
        </h2>
        <p className="text-text-subdued">{t('role.dataAccessIntro')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {DATA_CLASSES.map((dataClass) => (
            <Controller
              key={dataClass}
              control={form.control}
              name={`dataAccess.${dataClass}`}
              render={({ field }) => (
                <Dropdown
                  label={t(`role.classes.${dataClass}`)}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={readOnly}
                  options={DATA_ACCESS_LEVELS.map((level) => ({ value: level, label: t(`role.levels.${level}`) }))}
                />
              )}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="role-permissions" className="flex flex-col gap-4">
        <h2 id="role-permissions" className="heading-3">
          {t('role.permissions')}
        </h2>
        <p className="text-text-subdued">{t('role.permissionsIntro')}</p>
        <Controller
          control={form.control}
          name="permissions"
          render={({ field }) => (
            <div className="grid gap-6 lg:grid-cols-2">
              {[...modules.entries()].map(([module, permissions]) =>
                module === 'sad' ? (
                  <SadSectionGrid key={module} permissions={permissions} value={field.value} onChange={field.onChange} disabled={readOnly} />
                ) : (
                  <fieldset key={module} className="flex flex-col gap-1">
                    <legend className="mb-2 font-semibold">{t(`role.modules.${module}`, { defaultValue: module })}</legend>
                    {permissions.map((permission) => (
                      <Checkbox
                        key={permission.code}
                        label={permission.description}
                        description={permission.code}
                        disabled={readOnly}
                        checked={field.value.includes(permission.code)}
                        onCheckedChange={(checked) =>
                          field.onChange(checked ? [...field.value, permission.code] : field.value.filter((code) => code !== permission.code))
                        }
                      />
                    ))}
                  </fieldset>
                ),
              )}
            </div>
          )}
        />
      </section>

      {!readOnly && (
        <div>
          <Button type="submit" loading={save.isPending}>
            {role ? t('role.save') : t('role.create')}
          </Button>
        </div>
      )}

      {role && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => {
            setConfirmDelete(false)
            deleteRole.reset()
          }}
          title={t('role.deleteTitle', { name: role.name })}
          description={t('role.deleteBody')}
          confirmLabel={t('role.delete')}
          onConfirm={() => deleteRole.mutate(role.id, { onSuccess: () => void navigate('/admin/roles', { replace: true }) })}
          pending={deleteRole.isPending}
          error={deleteRole.error}
        />
      )}
    </form>
  )
}
