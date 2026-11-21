import { useEffect } from 'react'
import { applyTheme, useThemeStore } from './theme-store'

/** Keeps <html data-theme> in sync with the stored preference. Renders nothing. */
export function ThemeController() {
  const preference = useThemeStore((state) => state.preference)
  useEffect(() => applyTheme(preference), [preference])
  return null
}
