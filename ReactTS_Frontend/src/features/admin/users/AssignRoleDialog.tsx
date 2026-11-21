import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ActionFailed } from '../../../components/page/QueryStates'
import { useDateLabels } from '../../../components/page/useDateLabels'
import { useCan } from '../../../auth/permissions'
import { Button, DatePicker, Dialog, Dropdown } from '../../../components/qi'
import { endOfDayMy, startOfDayMy, todayMy } from '../../../lib/dates'
import { ApplicationPicker } from '../../trm/ApplicationPicker'
import { usePortfolios } from '../../trm/queries'
import { useCreateAssignment, useDepartments, useRoles } from '../queries'
import { ASSIGNABLE_SCOPES, type User } from '../schemas'

const FORM_ID = 'assign-role-form'

export function AssignRoleDialog({ user, name, open, onOpenChange }: { user: User; name: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const dateLabels = useDateLabels()
  const roles = useRoles()
  const departments = useDepartments()
  const createAssignment = useCreateAssignment(user.id)
  // Portfolio and application scopes need TRM data, so they are offered to people who can view TRM.
  const can = useCan()
  const trmScopes = can('trm:application:read')
  const portfolios = usePortfolios(trmScopes && open)
  const schema = z
    .object({
      roleCode: z.string({ error: t('user.errors.role') }).min(1, t('user.errors.role')),
      scopeType: z.enum(ASSIGNABLE_SCOPES),
      departmentId: z.string().nullable(),
      portfolioId: z.string().nullable(),
      application: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
      startsOn: z.string().nullable(),
      endsOn: z.string().nullable(),
    })
    .refine((value) => value.scopeType !== 'department' || value.departmentId, { path: ['departmentId'], message: t('user.errors.department') })
    .refine((value) => value.scopeType !== 'portfolio' || value.portfolioId, { path: ['portfolioId'], message: t('user.errors.portfolio') })
    .refine((value) => value.scopeType !== 'application' || value.application, { path: ['application'], message: t('user.errors.application') })
    .refine((value) => !value.startsOn || !value.endsOn || value.endsOn >= value.startsOn, { path: ['endsOn'], message: t('user.errors.order') })
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { roleCode: '', scopeType: 'global' as const, departmentId: null, portfolioId: null, application: null, startsOn: null, endsOn: null },
  })
  const startsOn = useWatch({ control: form.control, name: 'startsOn' })
  const scopeType = useWatch({ control: form.control, name: 'scopeType' })

  const close = () => {
    form.reset()
    createAssignment.reset()
    onOpenChange(false)
  }

  const submit = form.handleSubmit(async ({ roleCode, scopeType: scope, departmentId, portfolioId, application, startsOn: from, endsOn }) => {
    const scopeId = { global: null, department: departmentId, portfolio: portfolioId, application: application?.id ?? null }[scope]
    await createAssignment.mutateAsync({
      userId: user.id,
      roleCode,
      scopeType: scope,
      ...(scope !== 'global' && { scopeId }),
      // A first day of today means "now", so the role works straight away.
      ...(from && from > todayMy() && { validFrom: startOfDayMy(from) }),
      ...(endsOn && { validTo: endOfDayMy(endsOn) }),
    })
    close()
  })

  // The administrator role needs "Grant the system administrator role", and vendors can never be administrators.
  const roleOptions = (roles.data?.items ?? [])
    .filter((role) => !role.isSystemAdmin || (!user.isExternal && can('access:system-admin:manage')))
    .map((role) => ({ value: role.code, label: role.name }))

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('user.assignTitle', { name })}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={createAssignment.isPending}>
            {t('user.assign')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event).catch(() => undefined)} className="flex flex-col gap-4">
        <ActionFailed error={createAssignment.error} />
        <Controller
          control={form.control}
          name="roleCode"
          render={({ field, fieldState }) => (
            <Dropdown
              label={t('user.role')}
              placeholder={t('user.rolePlaceholder')}
              value={field.value || null}
              onValueChange={field.onChange}
              options={roleOptions}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={form.control}
          name="scopeType"
          render={({ field }) => (
            <Dropdown
              label={t('user.scope')}
              value={field.value}
              onValueChange={field.onChange}
              options={[
                { value: 'global', label: t('user.scopeGlobal') },
                { value: 'department', label: t('user.scopeDept') },
                ...(trmScopes
                  ? [
                      { value: 'portfolio' as const, label: t('user.scopePortfolioOption') },
                      { value: 'application' as const, label: t('user.scopeApplicationOption') },
                    ]
                  : []),
              ]}
            />
          )}
        />
        {scopeType === 'department' && (
          <Controller
            control={form.control}
            name="departmentId"
            render={({ field, fieldState }) => (
              <Dropdown
                label={t('user.department')}
                placeholder={t('user.scopeDeptPlaceholder')}
                value={field.value}
                onValueChange={field.onChange}
                options={(departments.data?.items ?? []).filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))}
                error={fieldState.error?.message}
              />
            )}
          />
        )}
        {scopeType === 'portfolio' && (
          <Controller
            control={form.control}
            name="portfolioId"
            render={({ field, fieldState }) => (
              <Dropdown
                label={t('user.portfolio')}
                placeholder={t('user.portfolioPlaceholder')}
                value={field.value}
                onValueChange={field.onChange}
                options={(portfolios.data?.items ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))}
                error={fieldState.error?.message}
              />
            )}
          />
        )}
        {scopeType === 'application' && (
          <Controller
            control={form.control}
            name="application"
            render={({ field, fieldState }) => <ApplicationPicker label={t('user.application')} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
          />
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Controller
            control={form.control}
            name="startsOn"
            render={({ field }) => (
              <DatePicker label={t('user.startsOn')} hint={t('user.startsHint')} value={field.value} onChange={field.onChange} min={todayMy()} labels={dateLabels} />
            )}
          />
          <Controller
            control={form.control}
            name="endsOn"
            render={({ field, fieldState }) => (
              <DatePicker
                label={t('user.endsOn')}
                hint={t('user.endsHint')}
                value={field.value}
                onChange={field.onChange}
                min={startsOn ?? todayMy()}
                labels={dateLabels}
                error={fieldState.error?.message}
              />
            )}
          />
        </div>
      </form>
    </Dialog>
  )
}
