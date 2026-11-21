import { Controller, Delete, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { PageQuerySchema, type PageQuery } from '../../common/http/pagination.js';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../common/zod/index.js';
import type { Department } from '../identity/department.entity.js';
import { personName } from '../identity/person-name.js';
import type { User } from '../identity/user.entity.js';
import {
  AssignmentListSchema,
  RefusedSignInPageSchema,
  ClassifiedFieldListSchema,
  ClassifiedFieldSchema,
  FieldClassKeySchema,
  UpdateFieldClassSchema,
  type UpdateFieldClass,
  AssignmentSchemaOut,
  CreateAssignmentSchema,
  CreateDepartmentSchema,
  CreateRoleSchema,
  CreateUserSchema,
  DepartmentListSchema,
  DepartmentSchemaOut,
  MeSchema,
  type PeopleQuery,
  PeopleQuerySchema,
  PermissionListSchema,
  PersonSchemaOut,
  RoleListSchema,
  RoleSchemaOut,
  type UpdateDepartment,
  UpdateDepartmentSchema,
  UpdateRoleSchema,
  UpdateUserSchema,
  UserPageSchema,
  UserQuerySchema,
  UserSchemaOut,
  type CreateAssignment,
  type CreateRole,
  type CreateUser,
  type UpdateRole,
  type UpdateUser,
  type UserQuery,
} from './access.schemas.js';
import { AccessService, assignmentView } from './access.service.js';
import { Authenticated, AuditResource, CurrentPrincipal, RequirePermission } from './decorators.js';
import { FieldClassService } from './field-classes.js';
import type { Principal } from './principal.js';

const IdParam = z.uuid();

function userView(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailFromOkta: user.emailFromOkta,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    isExternal: user.isExternal,
    departmentId: user.department?.id ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    version: user.version,
  };
}

function departmentView(department: Department) {
  return { id: department.id, code: department.code, name: department.name, active: department.active, version: department.version };
}

@ApiTags('Me')
@AuditResource('me')
@Controller({ path: 'me', version: '1' })
export class MeController {
  @Get()
  @Authenticated('Every signed-in user may see their own identity and permissions')
  @ZodResponse({ status: 200, schema: MeSchema, description: 'The signed-in user, roles and effective permissions' })
  me(@CurrentPrincipal() principal: Principal) {
    return {
      user: principal.user,
      roles: principal.roleCodes(),
      permissions: principal.permissionCodes(),
      isSystemAdmin: principal.isSystemAdmin,
      authMethod: principal.auth.method,
      session:
        principal.auth.accessExpiresAt && principal.auth.sessionExpiresAt
          ? { accessExpiresAt: principal.auth.accessExpiresAt, expiresAt: principal.auth.sessionExpiresAt }
          : null,
    };
  }
}

@ApiTags('Access control')
@AuditResource('role')
@Controller({ version: '1' })
export class RolesController {
  constructor(private readonly access: AccessService) {}

  @Get('permissions')
  @RequirePermission('access:role:read')
  @ZodResponse({ status: 200, schema: PermissionListSchema, description: 'Permission catalogue' })
  permissions() {
    return { items: this.access.listPermissions() };
  }

  @Get('roles')
  @RequirePermission('access:role:read')
  @ZodResponse({ status: 200, schema: RoleListSchema, description: 'All roles' })
  async list() {
    return { items: await this.access.listRoles() };
  }

  @Get('roles/:id')
  @RequirePermission('access:role:read')
  @ZodResponse({ status: 200, schema: RoleSchemaOut, description: 'The role' })
  get(@ZodParam('id', IdParam) id: string) {
    return this.access.getRole(id);
  }

  @Post('roles')
  @RequirePermission('access:role:manage')
  @ZodResponse({ status: 201, schema: RoleSchemaOut, description: 'Created role' })
  create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateRoleSchema) body: CreateRole) {
    return this.access.createRole(principal, body);
  }

  @Patch('roles/:id')
  @RequirePermission('access:role:manage')
  @ZodResponse({ status: 200, schema: RoleSchemaOut, description: 'Updated role' })
  update(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateRoleSchema) body: UpdateRole) {
    return this.access.updateRole(principal, id, body);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermission('access:role:manage')
  @ZodResponse({ status: 204, schema: z.undefined(), description: 'Deleted' })
  async remove(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string): Promise<void> {
    await this.access.deleteRole(principal, id);
  }
}

@ApiTags('Access control')
@AuditResource('user')
@Controller({ version: '1' })
export class UsersController {
  constructor(private readonly access: AccessService) {}

  @Get('users')
  @RequirePermission('access:user:read')
  @ZodResponse({ status: 200, schema: UserPageSchema, description: 'Users, paged' })
  async list(@ZodQuery(UserQuerySchema) query: UserQuery) {
    const { items, total } = await this.access.listUsers(query);
    return { items: items.map(userView), page: query.page, pageSize: query.pageSize, total };
  }

  @Get('users/:id')
  @RequirePermission('access:user:read')
  @ZodResponse({ status: 200, schema: UserSchemaOut, description: 'The user' })
  async get(@ZodParam('id', IdParam) id: string) {
    return userView(await this.access.getUser(id));
  }

  @Post('users')
  @RequirePermission('access:user:manage')
  @ZodResponse({ status: 201, schema: UserSchemaOut, description: 'Created user' })
  async create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateUserSchema) body: CreateUser) {
    return userView(await this.access.createUser(principal, body));
  }

  @Patch('users/:id')
  @RequirePermission('access:user:manage')
  @ZodResponse({ status: 200, schema: UserSchemaOut, description: 'Updated user' })
  async update(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateUserSchema) body: UpdateUser) {
    return userView(await this.access.updateUser(principal, id, body));
  }

  @Get('users/:id/role-assignments')
  @RequirePermission('access:assignment:read')
  @ZodResponse({ status: 200, schema: AssignmentListSchema, description: "The user's role assignments, current and past" })
  async assignments(@ZodParam('id', IdParam) id: string) {
    return { items: (await this.access.listAssignments(id)).map((assignment) => assignmentView(assignment)) };
  }

  @Post('role-assignments')
  @RequirePermission('access:assignment:manage')
  @ZodResponse({ status: 201, schema: AssignmentSchemaOut, description: 'Created assignment' })
  async assign(@CurrentPrincipal() principal: Principal, @ZodBody(CreateAssignmentSchema) body: CreateAssignment) {
    return assignmentView(await this.access.createAssignment(principal, body));
  }

  @Post('role-assignments/:id/end')
  @HttpCode(200)
  @RequirePermission('access:assignment:manage')
  @ZodResponse({ status: 200, schema: AssignmentSchemaOut, description: 'Ended assignment (kept for history)' })
  async end(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return assignmentView(await this.access.endAssignment(principal, id));
  }
}

@ApiTags('Access control')
@AuditResource('department')
@Controller({ path: 'departments', version: '1' })
export class DepartmentsController {
  constructor(private readonly access: AccessService) {}

  @Get()
  @Authenticated('Department names are reference data every signed-in user needs for forms')
  @ZodResponse({ status: 200, schema: DepartmentListSchema, description: 'All departments, active and inactive' })
  async list() {
    return { items: (await this.access.listDepartments()).map(departmentView) };
  }

  @Post()
  @RequirePermission('access:department:manage')
  @ZodResponse({ status: 201, schema: DepartmentSchemaOut, description: 'Created department' })
  async create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateDepartmentSchema) body: { code: string; name: string }) {
    return departmentView(await this.access.createDepartment(principal, body));
  }

  @Patch(':id')
  @RequirePermission('access:department:manage')
  @ZodResponse({ status: 200, schema: DepartmentSchemaOut, description: 'Updated department' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @ZodParam('id', z.uuid()) id: string,
    @ZodBody(UpdateDepartmentSchema) body: UpdateDepartment,
  ) {
    return departmentView(await this.access.updateDepartment(principal, id, body));
  }
}

@ApiTags('Access control')
@AuditResource('person')
@Controller({ path: 'people', version: '1' })
export class PeopleController {
  constructor(private readonly access: AccessService) {}

  @Get()
  @RequirePermission('people:directory:read')
  @ZodResponse({ status: 200, schema: z.object({ items: z.array(PersonSchemaOut) }), description: 'Matching active people (at most 20)' })
  async find(@ZodQuery(PeopleQuerySchema) query: PeopleQuery) {
    const people = await this.access.findPeople(query);
    return {
      items: people.map((user) => ({
        id: user.id,
        name: personName(user),
        email: user.email,
        isExternal: user.isExternal,
      })),
    };
  }
}

/** Which structured fields are financial, contract, personal or internal: decides who sees them. */
@ApiTags('Access control')
@AuditResource('field-class')
@Controller({ path: 'field-classes', version: '1' })
export class FieldClassesController {
  constructor(private readonly fieldClasses: FieldClassService) {}

  @Get()
  @RequirePermission('access:field-class:manage')
  @ZodResponse({ status: 200, schema: ClassifiedFieldListSchema, description: 'Every classified field with its class in force and its default' })
  list() {
    return this.fieldClasses.list();
  }

  @Put(':key')
  @RequirePermission('access:field-class:manage')
  @ZodResponse({ status: 200, schema: ClassifiedFieldSchema, description: 'Class changed (applies at once; audited)' })
  set(@CurrentPrincipal() principal: Principal, @ZodParam('key', FieldClassKeySchema) key: string, @ZodBody(UpdateFieldClassSchema) body: UpdateFieldClass) {
    return this.fieldClasses.set(principal, key, body.dataClass);
  }
}

/** People Okta signed in who have not been added: administrators add or dismiss them. */
@ApiTags('Access control')
@AuditResource('refused-sign-in')
@Controller({ path: 'refused-sign-ins', version: '1' })
export class RefusedSignInsController {
  constructor(private readonly access: AccessService) {}

  @Get()
  @RequirePermission('access:user:manage')
  @ZodResponse({ status: 200, schema: RefusedSignInPageSchema, description: 'Refused sign-ins, latest attempt first (kept 90 days)' })
  async list(@ZodQuery(PageQuerySchema) query: PageQuery) {
    const { items, total } = await this.access.listRefusedSignIns(query);
    return {
      items: items.map((entry) => ({
        id: entry.id,
        username: entry.username,
        email: entry.email ?? null,
        firstName: entry.firstName,
        lastName: entry.lastName,
        attempts: entry.attempts,
        firstAttemptAt: entry.firstAttemptAt,
        lastAttemptAt: entry.lastAttemptAt,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  @Delete(':id')
  @RequirePermission('access:user:manage')
  @HttpCode(204)
  @ZodResponse({ status: 204, schema: z.undefined(), description: 'Dismissed' })
  async dismiss(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string): Promise<void> {
    await this.access.dismissRefusedSignIn(principal, id);
  }
}
