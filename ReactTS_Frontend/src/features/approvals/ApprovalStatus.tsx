import { useTranslation } from 'react-i18next'
import { StatusIndicator, type StatusTone } from '../../components/qi'
import type { InstanceStatus } from './schemas'

const TONE: Record<InstanceStatus, StatusTone> = {
  in_progress: 'informative',
  awaiting_info: 'attention',
  returned: 'negative',
  approved: 'positive',
  cancelled: 'ended',
}

/** Qi status indicator for an approval (icon + text, never colour alone). */
export function ApprovalStatus({ status }: { status: InstanceStatus }) {
  const { t } = useTranslation()
  return <StatusIndicator tone={TONE[status]}>{t(`approvals.status.${status}`)}</StatusIndicator>
}
