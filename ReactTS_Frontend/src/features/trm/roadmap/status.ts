import type { StatusTone } from '../../../components/qi'
import type { InitiativeStatus } from '../schemas'

/** Initiative status as a Qi tone (always shown with its text). */
export const INITIATIVE_TONES: Record<InitiativeStatus, StatusTone> = {
  proposed: 'informative',
  approved: 'positive',
  in_progress: 'informative',
  completed: 'positive',
  cancelled: 'ended',
}

/** Initiative status as a timeline bar colour (Qi chart colours; red is kept for actions). */
export const INITIATIVE_COLOURS: Record<InitiativeStatus, string> = {
  proposed: 'bg-data-visualisation-category-2',
  approved: 'bg-data-visualisation-category-4',
  in_progress: 'bg-data-visualisation-category-3',
  completed: 'bg-data-visualisation-positive',
  cancelled: 'bg-data-visualisation-neutral',
}
