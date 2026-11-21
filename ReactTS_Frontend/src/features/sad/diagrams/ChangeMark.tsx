import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { CHANGE_BORDER } from './change-colours'
import type { ChangeKind } from './compare'

/** "Added", "Removed" or "Changed" in a chip outlined in its colour. */
export function ChangeMark({ change, className }: { change: ChangeKind; className?: string }) {
  const { t } = useTranslation()
  return <span className={cn('inline-block rounded-tag border-2 bg-surface-default px-1.5 text-xs leading-4 font-semibold whitespace-nowrap text-text-default', CHANGE_BORDER[change], className)}>{t(`sad.compare.kinds.${change}`)}</span>
}
