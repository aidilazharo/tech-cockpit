import type { Assignment } from '../schemas'

export type AssignmentStatus = 'active' | 'scheduled' | 'ended'

export function assignmentStatus(assignment: Assignment, now = Date.now()): AssignmentStatus {
  if (assignment.validTo && Date.parse(assignment.validTo) <= now) return 'ended'
  if (Date.parse(assignment.validFrom) > now) return 'scheduled'
  return 'active'
}
