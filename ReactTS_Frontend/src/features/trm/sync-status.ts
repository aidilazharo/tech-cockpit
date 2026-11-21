import type { StatusTone } from '../../components/qi'
import type { SyncRunSummary } from './schemas'

/** Sync run status as a Qi status tone (always shown with its text). */
export const RUN_TONES: Record<SyncRunSummary['status'], StatusTone> = {
  receiving: 'informative',
  completed: 'positive',
  failed: 'negative',
  abandoned: 'ended',
}
