import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ActionFailed } from '../../../components/page/QueryStates'
import { Button, Dialog } from '../../../components/qi'
import { useUpdateUser } from '../queries'
import type { User } from '../schemas'
import { userFormSchema } from './user-form'
import { UserFields } from './UserFields'

const FORM_ID = 'edit-user-form'

/** Okta username, email (unless Okta sent it), names and Employee/Vendor; audited by the API. */
export function EditUserDialog({ user, name, onClose }: { user: User; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const update = useUpdateUser(user.id)
  const form = useForm({
    resolver: zodResolver(userFormSchema(t)),
    defaultValues: { username: user.username, email: user.email, firstName: user.firstName, lastName: user.lastName, type: user.isExternal ? 'vendor' : 'employee' },
  })

  const submit = form.handleSubmit(async ({ username, email, firstName, lastName, type }) => {
    await update.mutateAsync({
      username,
      ...(!user.emailFromOkta && { email }),
      firstName,
      lastName,
      isExternal: type === 'vendor',
      version: user.version,
    })
    onClose()
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('user.editTitle', { name })}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event).catch(() => undefined)} className="flex flex-col gap-4">
        <ActionFailed error={update.error} />
        <UserFields control={form.control} register={form.register} errors={form.formState.errors} emailFromOkta={user.emailFromOkta} />
      </form>
    </Dialog>
  )
}
