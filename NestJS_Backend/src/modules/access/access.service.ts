import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { likePattern, type PageQuery } from '../../common/http/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import { Department } from '../identity/department.entity.js';
import { RefusedSignIn } from '../identity/refused-sign-in.entity.js';
import { User } from '../identity/user.entity.js';
import type {
  CreateAssignment,
  CreateRole,
  CreateUser,
  PeopleQuery,
  UpdateDepartment,
  UpdateRole,
  UpdateUser,
  UserQuery,
} from './access.schemas.js';
import { PERMISSION_CATALOGUE, type PermissionCode } from './permission-catalogue.js';
import {
  type AuthInfo,
  type DataAccess,
  DATA_ACCESS_LEVELS,
  DATA_CLASSES,
  Principal,
} from './principal.js';
import { actingForStaff } from './acting-for-staff.js';
import { RoleAssignment } from './role-assignment.entity.js';
import { Role } from './role.entity.js';

const LEVEL_RANK = Object.fromEntries(DATA_ACCESS_LEVELS.map((level, index) => [level, index]));

/** What the audit log records about a user. */
function userAudit(user: User) {
  return {
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isExternal: user.isExternal,
    status: user.status,
  };
}

function activeWhere(now: Date) {
  return { validFrom: { $lte: now }, $or: [{ validTo: null }, { validTo: { $gt: now } }] };
}

function roleSnapshot(role: Role) {
  return {
    code: role.code,
    name: role.name,
    description: role.description ?? null,
    permissions: [...role.permissions],
    dataAccess: { ...role.dataAccess },
    canActForStaff: role.canActForStaff,
  };
}

export function assignmentView(assignment: RoleAssignment, now = new Date()) {
  return {
    id: assignment.id,
    userId: assignment.user.id,
    roleCode: assignment.role.code,
    roleName: assignment.role.name,
    scopeType: assignment.scopeType,
    scopeId: assignment.scopeId ?? null,
    validFrom: assignment.validFrom,
    validTo: assignment.validTo ?? null,
    active: assignment.validFrom <= now && (!assignment.validTo || assignment.validTo > now),
  };
}

@Injectable()
export class AccessService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  /** Internal people holding a system administrator role now (vendors never do), e.g. to tell them about malware found in an upload. */
  async systemAdmins(now: Date): Promise<User[]> {
    const assignments = await this.em.fork().find(RoleAssignment, { role: { isSystemAdmin: true }, user: { status: 'active', isExternal: false }, ...activeWhere(now) }, { populate: ['user'] });
    return [...new Map(assignments.map((assignment) => [assignment.user.id, assignment.user])).values()];
  }

  /** Builds the principal for an active user, or null when the user is missing or disabled. */
  async loadPrincipal(userId: string, auth: AuthInfo, now = new Date()): Promise<Principal | null> {
    const em = this.em.fork();
    const user = await em.findOne(User, { id: userId, status: 'active' });
    if (!user) {
      return null;
    }
    const active = await em.find(RoleAssignment, { user: userId, ...activeWhere(now) }, { populate: ['role'] });
    // A vendor never acts as system administrator, even if the role was assigned before
    // Okta marked them as a vendor.
    const assignments = user.isExternal ? active.filter((assignment) => !assignment.role.isSystemAdmin) : active;
    return new Principal(
      { id: user.id, username: user.username, email: user.email, firstName: user.firstName, lastName: user.lastName, isExternal: user.isExternal },
      assignments.map((assignment) => ({
        roleCode: assignment.role.code,
        permissions: new Set(assignment.role.permissions),
        scope: { scopeType: assignment.scopeType, scopeId: assignment.scopeId ?? null },
        dataAccess: assignment.role.dataAccess,
      })),
      auth,
      assignments.some((assignment) => assignment.role.isSystemAdmin),
    );
  }

  // ----- Anti-escalation ---------------------------------------------------

  /** Non-admins can only hand out permissions and data access they hold themselves. */
  private assertCanGrant(principal: Principal, permissions: readonly string[], dataAccess: DataAccess): void {
    if (principal.isSystemAdmin) return;
    const notHeld = permissions.filter((code) => !principal.can(code as PermissionCode));
    if (notHeld.length > 0) {
      throw new ForbiddenException(`You cannot grant permissions you do not hold: ${notHeld.join(', ')}`);
    }
    for (const dataClass of DATA_CLASSES) {
      const own = Math.max(0, ...principal.grants.map((grant) => LEVEL_RANK[grant.dataAccess[dataClass]]));
      if (LEVEL_RANK[dataAccess[dataClass]] > own) {
        throw new ForbiddenException(`You cannot grant ${dataClass} access above your own`);
      }
    }
  }

  // ----- Roles -------------------------------------------------------------

  listRoles(): Promise<Role[]> {
    return this.em.find(Role, {}, { orderBy: { code: 'asc' } });
  }

  async getRole(id: string): Promise<Role> {
    const role = await this.em.findOne(Role, id);
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  listPermissions() {
    return Object.entries(PERMISSION_CATALOGUE).map(([code, description]) => ({ code, description }));
  }

  async createRole(principal: Principal, input: CreateRole): Promise<Role> {
    this.assertCanGrant(principal, input.permissions, input.dataAccess);
    const role = this.em.create(Role, {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      permissions: [...new Set(input.permissions)],
      dataAccess: input.dataAccess,
      canActForStaff: input.canActForStaff,
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await this.em.flush();
    await this.audit.recordChange(principal, 'role.created', 'role', role.id, { before: null, after: roleSnapshot(role) });
    return role;
  }

  async updateRole(principal: Principal, id: string, input: UpdateRole): Promise<Role> {
    const role = await this.getRole(id);
    if (role.isSystemAdmin) {
      throw new ConflictException('The system administrator role cannot be changed');
    }
    await this.em.lock(role, LockMode.OPTIMISTIC, input.version);
    const before = roleSnapshot(role);
    const permissions = input.permissions ?? role.permissions;
    const dataAccess = input.dataAccess ?? role.dataAccess;
    this.assertCanGrant(principal, permissions, dataAccess);
    role.name = input.name ?? role.name;
    if (input.description !== undefined) role.description = input.description;
    role.permissions = [...new Set(permissions)];
    role.dataAccess = dataAccess;
    if (input.canActForStaff !== undefined) role.canActForStaff = input.canActForStaff;
    role.updatedBy = principal.user.id;
    await this.em.flush();
    await this.audit.recordChange(principal, 'role.updated', 'role', role.id, { before, after: roleSnapshot(role) });
    return role;
  }

  async deleteRole(principal: Principal, id: string): Promise<void> {
    const role = await this.getRole(id);
    if (role.isSystem) {
      throw new ConflictException('Seeded system roles cannot be deleted');
    }
    if ((await this.em.count(RoleAssignment, { role: id, ...activeWhere(new Date()) })) > 0) {
      throw new ConflictException('The role is still assigned to users');
    }
    const before = roleSnapshot(role);
    await this.em.nativeDelete(RoleAssignment, { role: id });
    this.em.remove(role);
    await this.em.flush();
    await this.audit.recordChange(principal, 'role.deleted', 'role', id, { before, after: null });
  }

  // ----- Users -------------------------------------------------------------

  async listUsers(query: UserQuery): Promise<{ items: User[]; total: number }> {
    const where = query.q
      ? {
          $or: [
            { username: { $ilike: likePattern(query.q) } },
            { email: { $ilike: likePattern(query.q) } },
            { firstName: { $ilike: likePattern(query.q) } },
            { lastName: { $ilike: likePattern(query.q) } },
          ],
        }
      : {};
    const [items, total] = await this.em.findAndCount(User, where, {
      orderBy: { username: 'asc' },
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return { items, total };
  }

  async getUser(id: string): Promise<User> {
    const user = await this.em.findOne(User, id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async createUser(principal: Principal, input: CreateUser): Promise<User> {
    const user = this.em.create(User, {
      username: input.username,
      email: input.email,
      firstName: input.firstName ?? '',
      lastName: input.lastName ?? '',
      isExternal: input.isExternal,
      department: input.departmentId ? this.em.getReference(Department, input.departmentId) : null,
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await this.em.flush();
    await this.forgetRefusal(user.username);
    await this.audit.recordChange(principal, 'user.created', 'user', user.id, { before: null, after: userAudit(user) });
    return user;
  }

  async updateUser(principal: Principal, id: string, input: UpdateUser): Promise<User> {
    const user = await this.getUser(id);
    await this.em.lock(user, LockMode.OPTIMISTIC, input.version);
    // Nobody disables their own account, system administrators included (they could lock everyone out).
    if (id === principal.user.id && input.status === 'disabled') {
      throw new UnprocessableEntityException('You cannot disable your own account');
    }
    if (input.email !== undefined && input.email !== user.email && user.emailFromOkta) {
      throw new UnprocessableEntityException('The email comes from Okta and cannot be changed here');
    }
    // A vendor can never be a system administrator.
    if (input.isExternal === true && !user.isExternal && (await this.holdsSystemAdmin(user.id))) {
      throw new UnprocessableEntityException('End the system administrator role first');
    }
    const before = userAudit(user);
    if (input.username !== undefined) user.username = input.username;
    if (input.email !== undefined) user.email = input.email;
    if (input.firstName !== undefined) user.firstName = input.firstName;
    if (input.lastName !== undefined) user.lastName = input.lastName;
    if (input.isExternal !== undefined) user.isExternal = input.isExternal;
    if (input.status !== undefined) user.status = input.status;
    if (input.departmentId !== undefined) {
      user.department = input.departmentId ? this.em.getReference(Department, input.departmentId) : null;
    }
    user.updatedBy = principal.user.id;
    await this.em.flush();
    if (before.username !== user.username) await this.forgetRefusal(user.username);
    await this.audit.recordChange(principal, 'user.updated', 'user', user.id, { before, after: userAudit(user) });
    return user;
  }

  /** Holds a system administrator role now or later (an assignment that has not ended). */
  private async holdsSystemAdmin(userId: string, now = new Date()): Promise<boolean> {
    return (await this.em.count(RoleAssignment, { user: userId, role: { isSystemAdmin: true }, $or: [{ validTo: null }, { validTo: { $gt: now } }] })) > 0;
  }

  /** Once someone is added, their refused sign-ins are no longer listed. */
  private async forgetRefusal(username: string): Promise<void> {
    await this.em.nativeDelete(RefusedSignIn, { username });
  }

  // ----- Refused sign-ins --------------------------------------------------

  async listRefusedSignIns(query: PageQuery): Promise<{ items: RefusedSignIn[]; total: number }> {
    const [items, total] = await this.em.findAndCount(RefusedSignIn, {}, {
      orderBy: { lastAttemptAt: 'desc', id: 'asc' },
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return { items, total };
  }

  async dismissRefusedSignIn(principal: Principal, id: string): Promise<void> {
    const entry = await this.em.findOne(RefusedSignIn, id);
    if (!entry) throw new NotFoundException('Refused sign-in not found');
    this.em.remove(entry);
    await this.em.flush();
    await this.audit.recordChange(principal, 'refused-sign-in.dismissed', 'refused-sign-in', id, { before: { username: entry.username }, after: null });
  }

  // ----- Role assignments --------------------------------------------------

  async listAssignments(userId: string): Promise<RoleAssignment[]> {
    await this.getUser(userId);
    return this.em.find(RoleAssignment, { user: userId }, { populate: ['role'], orderBy: { validFrom: 'desc' } });
  }

  async createAssignment(principal: Principal, input: CreateAssignment): Promise<RoleAssignment> {
    const user = await this.getUser(input.userId);
    const role = await this.em.findOne(Role, { code: input.roleCode });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystemAdmin && !principal.can('access:system-admin:manage')) {
      throw new ForbiddenException('You may not grant the system administrator role');
    }
    if (role.isSystemAdmin && user.isExternal) {
      throw new UnprocessableEntityException('External users cannot be system administrators');
    }
    if (user.id === principal.user.id && !principal.isSystemAdmin) {
      throw new ForbiddenException('You cannot change your own role assignments');
    }
    // The system administrator role is granted by its own permission (checked above), not by holding what it holds.
    if (!role.isSystemAdmin) this.assertCanGrant(principal, role.permissions, role.dataAccess);
    const assignment = this.em.create(RoleAssignment, {
      user,
      role,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      validFrom: input.validFrom ?? new Date(),
      validTo: input.validTo ?? null,
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await this.em.flush();
    await this.audit.recordChange(principal, 'role-assignment.created', 'role-assignment', assignment.id, {
      before: null,
      after: { userId: user.id, roleCode: role.code, scopeType: assignment.scopeType, scopeId: assignment.scopeId ?? null },
    });
    return assignment;
  }

  async endAssignment(principal: Principal, id: string): Promise<RoleAssignment> {
    const assignment = await this.em.findOne(RoleAssignment, id, { populate: ['role', 'user'] });
    if (!assignment) throw new NotFoundException('Role assignment not found');
    if (assignment.role.isSystemAdmin && !principal.can('access:system-admin:manage')) {
      throw new ForbiddenException('You may not remove the system administrator role');
    }
    const now = new Date();
    if (!assignment.validTo || assignment.validTo > now) {
      assignment.validTo = now;
      assignment.updatedBy = principal.user.id;
      await this.em.flush();
      await this.audit.recordChange(principal, 'role-assignment.ended', 'role-assignment', assignment.id, {
        before: null,
        after: { validTo: now.toISOString() },
      });
    }
    return assignment;
  }

  // ----- Departments -------------------------------------------------------

  /** Every department, active or not (forms offer only active ones). */
  listDepartments(): Promise<Department[]> {
    return this.em.find(Department, {}, { orderBy: { name: 'asc' } });
  }

  async updateDepartment(principal: Principal, id: string, input: UpdateDepartment): Promise<Department> {
    const department = await this.em.findOne(Department, id);
    if (!department) throw new NotFoundException('Department not found');
    await this.em.lock(department, LockMode.OPTIMISTIC, input.version);
    const before = { name: department.name, active: department.active };
    if (input.name !== undefined) department.name = input.name;
    if (input.active !== undefined) department.active = input.active;
    department.updatedBy = principal.user.id;
    await this.em.flush();
    await this.audit.recordChange(principal, 'department.updated', 'department', department.id, {
      before,
      after: { name: department.name, active: department.active },
    });
    return department;
  }

  /**
   * Active people for pickers (delegate, reassign, approver). Name and work email only; needs the
   * staff-directory permission (checked on the route). `actsForStaff` keeps people who can act for staff.
   */
  async findPeople(query: PeopleQuery): Promise<User[]> {
    const where: Record<string, unknown> = { status: 'active' };
    if (query.ids) where.id = { $in: query.ids };
    if (query.actsForStaff) {
      const acting = [...(await actingForStaff(this.em))];
      where.id = query.ids ? { $in: query.ids.filter((id) => acting.includes(id)) } : { $in: acting };
    }
    if (query.q) {
      const pattern = likePattern(query.q);
      where.$or = [{ username: { $ilike: pattern } }, { email: { $ilike: pattern } }, { firstName: { $ilike: pattern } }, { lastName: { $ilike: pattern } }];
    }
    return this.em.find(User, where, { orderBy: { firstName: 'asc', lastName: 'asc' }, limit: 20 });
  }

  async createDepartment(principal: Principal, input: { code: string; name: string }): Promise<Department> {
    const department = this.em.create(Department, {
      code: input.code,
      name: input.name,
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await this.em.flush();
    await this.audit.recordChange(principal, 'department.created', 'department', department.id, { before: null, after: input });
    return department;
  }
}
