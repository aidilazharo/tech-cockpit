import { useTranslation } from 'react-i18next'
import type { Version } from './schemas'

/** "Version 2", or "Draft of version 3". */
export function useVersionLabel() {
  const { t } = useTranslation()
  return (version: Pick<Version, 'number' | 'draftOf'>) => (version.number !== null ? t('sad.document.versionN', { number: version.number }) : t('sad.document.draftOf', { number: version.draftOf }))
}
