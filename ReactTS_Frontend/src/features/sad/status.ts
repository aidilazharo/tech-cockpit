import { useCan } from '../../auth/permissions'
import type { StatusTone } from '../../components/qi'
import { RETENTION_READERS } from './permissions'
import type { VersionStatus } from './schemas'

/** Version status as a Qi tone (always shown with its text). */
export const VERSION_TONES: Record<VersionStatus, StatusTone> = {
  draft: 'informative',
  in_approval: 'attention',
  current: 'positive',
  superseded: 'ended',
  cancelled: 'ended',
}

/** What the signed-in user may use beyond the version itself (the API checks everything again). */
export function useSadAbilities() {
  const can = useCan()
  return {
    retention: RETENTION_READERS.some((code) => can(code)),
    applications: can('trm:application:read'),
  }
}
