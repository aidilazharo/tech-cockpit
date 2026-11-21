import { useTranslation } from 'react-i18next'

/** Display helpers for values ServiceNow may leave empty. */
export function useText() {
  const { t } = useTranslation()
  return {
    /** The value, or a dash when there is none. */
    dash: (value: string | null | undefined) => value ?? t('common.none'),
    /** A record's name, or "(no name)". */
    named: (name: string | null | undefined) => name ?? t('trm.unnamed'),
  }
}
