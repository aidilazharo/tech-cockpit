import { useTranslation } from 'react-i18next'
import { StatusIndicator } from '../../components/qi'

/** The application does its own authentication (section 5): icon and text, "(draft)" when only the open draft says so. */
export function LocalAuthFlag({ from = 'approved' }: { from?: 'approved' | 'draft' }) {
  const { t } = useTranslation()
  return <StatusIndicator tone="attention">{from === 'draft' ? t('sad.localAuth.draftFlag') : t('sad.localAuth.flag')}</StatusIndicator>
}
