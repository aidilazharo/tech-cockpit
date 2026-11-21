import type { EntityManager } from '@mikro-orm/postgresql';
import { RoleAssignment } from './role-assignment.entity.js';

/**
 * The users (of `userIds`, or all) who can act for staff today: out-of-office delegates and roadmap
 * owners. That is a role marked "Can act for staff", or the system administrator role (never a vendor's).
 */
export async function actingForStaff(em: EntityManager, userIds?: readonly string[], now = new Date()): Promise<Set<string>> {
  const assignments = await em.find(
    RoleAssignment,
    {
      user: { status: 'active', ...(userIds ? { id: { $in: [...userIds] } } : {}) },
      validFrom: { $lte: now },
      $or: [{ validTo: null }, { validTo: { $gt: now } }],
    },
    { populate: ['role', 'user'] },
  );
  return new Set(assignments.filter((a) => a.role.canActForStaff || (a.role.isSystemAdmin && !a.user.isExternal)).map((a) => a.user.id));
}
