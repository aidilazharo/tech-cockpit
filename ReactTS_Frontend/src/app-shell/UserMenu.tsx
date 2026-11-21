import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Avatar, initialsOf, Menu, MenuItem, MenuRadioGroup, MenuSection, MenuSeparator } from '../components/qi'
import { ChevronDownIcon, KeyIcon } from '../components/qi/icons'
import { useCan } from '../auth/permissions'
import { displayName, useAuthStore, type Me } from '../auth/auth-store'
import { useThemeStore, type ThemePreference } from '../theme/theme-store'

/** Avatar menu: who is signed in, theme, sign out. */
export function UserMenu({ me }: { me: Me }) {
  const { t } = useTranslation()
  const signOut = useAuthStore((state) => state.signOut)
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)
  const navigate = useNavigate()
  const can = useCan()
  const name = displayName(me.user)

  return (
    <Menu
      label={t('shell.accountMenu', { name, initials: initialsOf(name) })}
      trigger={
        <>
          <Avatar name={name} decorative />
          <ChevronDownIcon className="text-icon-default" />
        </>
      }
    >
      <MenuSection>
        <p className="font-semibold">{name}</p>
        <p className="text-sm text-text-subdued">{me.user.email}</p>
        {me.user.isExternal && (
          <span className="w-fit rounded-tag border border-divider-bold px-2 py-0.5 text-xs">{t('auth.external')}</span>
        )}
      </MenuSection>
      <MenuSeparator />
      <MenuRadioGroup<ThemePreference>
        label={t('theme.label')}
        value={preference}
        onValueChange={setPreference}
        options={[
          { value: 'system', label: t('theme.system') },
          { value: 'light', label: t('theme.light') },
          { value: 'dark', label: t('theme.dark') },
        ]}
      />
      <MenuSeparator />
      {can('apikey:own:manage') && (
        <MenuItem icon={<KeyIcon />} onClick={() => void navigate('/me/api-keys')}>
          {t('shell.apiKeys')}
        </MenuItem>
      )}
      <MenuItem onClick={() => void signOut()}>{t('auth.signOut')}</MenuItem>
    </Menu>
  )
}
