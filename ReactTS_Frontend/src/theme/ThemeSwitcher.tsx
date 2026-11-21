import { useTranslation } from 'react-i18next'
import { Dropdown } from '../components/qi/Dropdown/Dropdown'
import { useThemeStore, type ThemePreference } from './theme-store'

export function ThemeSwitcher() {
  const { t } = useTranslation()
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)

  return (
    <Dropdown<ThemePreference>
      label={t('theme.label')}
      value={preference}
      onValueChange={(value) => value && setPreference(value)}
      options={[
        { value: 'system', label: t('theme.system') },
        { value: 'light', label: t('theme.light') },
        { value: 'dark', label: t('theme.dark') },
      ]}
    />
  )
}
