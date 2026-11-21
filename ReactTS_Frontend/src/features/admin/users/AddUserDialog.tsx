import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ActionFailed } from '../../../components/page/QueryStates'
import { Button, Dialog, Dropdown } from '../../../components/qi'
import { useCreateUser, useDepartments } from '../queries'
import { userFormSchema } from './user-form'
import { UserFields } from './UserFields'

const FORM_ID = 'add-user-form'

/** What a refused sign-in tells us about the person, to fill the form in. */
export interface UserPrefill {
  username: string
  email: string | null
  firstName: string
  lastName: string
}

export function AddUserDialog({ open, onOpenChange, prefill = null }: { open: boolean; onOpenChange: (open: boolean) => void; prefill?: UserPrefill | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const departments = useDepartments()
  const createUser = useCreateUser()
  const form = useForm({
    resolver: zodResolver(userFormSchema(t)),
    defaultValues: {
      username: prefill?.username ?? '',
      email: prefill?.email ?? '',
      firstName: prefill?.firstName ?? '',
      lastName: prefill?.lastName ?? '',
      type: null,
      departmentId: null,
    },
  })

  const close = () => {
    form.reset()
    createUser.reset()
    onOpenChange(false)
  }

  const submit = form.handleSubmit(async ({ username, email, firstName, lastName, type, departmentId }) => {
    const user = await createUser.mutateAsync({
      username,
      email,
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      isExternal: type === 'vendor',
      ...(departmentId && { departmentId }),
    })
    close()
    void navigate(`/admin/users/${user.id}`)
  })

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('users.addTitle')}
      description={t('users.addDescription')}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={createUser.isPending}>
            {t('users.add')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event).catch(() => undefined)} className="flex flex-col gap-4">
        <ActionFailed error={createUser.error} />
        <UserFields control={form.control} register={form.register} errors={form.formState.errors} />
        <Controller
          control={form.control}
          name="departmentId"
          render={({ field }) => (
            <Dropdown
              label={t('users.department')}
              placeholder={t('users.noDepartment')}
              hint={t('common.optional')}
              value={field.value}
              onValueChange={field.onChange}
              options={(departments.data?.items ?? []).filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))}
            />
          )}
        />
      </form>
    </Dialog>
  )
}
