import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Dropdown, TextField } from '../../../components/qi'
import { USER_TYPES, type UserFormInput, type UserFormOutput } from './user-form'

/** Okta username, email, names and Employee/Vendor: shared by "Add user" and "Edit details". */
export function UserFields({
  control,
  register,
  errors,
  emailFromOkta = false,
}: {
  control: Control<UserFormInput, unknown, UserFormOutput>
  register: UseFormRegister<UserFormInput>
  errors: FieldErrors<UserFormInput>
  emailFromOkta?: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      <TextField label={t('users.username')} hint={t('users.usernameHint')} autoComplete="off" error={errors.username?.message} {...register('username')} />
      <TextField
        label={t('users.email')}
        type="email"
        autoComplete="off"
        disabled={emailFromOkta}
        hint={emailFromOkta ? t('users.emailFromOktaHint') : t('users.emailHint')}
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField label={t('users.firstName')} labelSuffix={t('common.optional')} error={errors.firstName?.message} {...register('firstName')} />
      <TextField label={t('users.lastName')} labelSuffix={t('common.optional')} error={errors.lastName?.message} {...register('lastName')} />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Dropdown
            label={t('users.type')}
            placeholder={t('users.typePlaceholder')}
            hint={t('users.typeHint')}
            value={field.value}
            onValueChange={field.onChange}
            error={errors.type?.message}
            options={USER_TYPES.map((value) => ({ value, label: t(`user.${value}`) }))}
          />
        )}
      />
    </>
  )
}
