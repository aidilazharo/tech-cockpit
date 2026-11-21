import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { backend, expectAcceptedRequest, expectSameResponse, frontend, shape } from '../../test/contract'
import { RefusedUsernameSchema } from '../../auth/refused-username'
import * as schemas from './schemas'

describe('administration responses match the API contract', () => {
  it.each([
    ['User', schemas.UserSchema],
    ['Role', schemas.RoleSchema],
    ['DataAccess', schemas.DataAccessSchema],
    ['Department', schemas.DepartmentSchema],
    ['RoleAssignment', schemas.AssignmentSchema],
    ['ApiKey', schemas.ApiKeySchema],
    ['CreatedApiKey', schemas.CreatedApiKeySchema],
    ['ClassifiedField', schemas.ClassifiedFieldSchema],
    ['RefusedUsername', RefusedUsernameSchema],
    ['RefusedSignIn', schemas.RefusedSignInSchema],
  ] as const)('%s', (name, schema) => expectSameResponse(name, schema))
})

describe('administration requests only send what the API accepts', () => {
  it.each([
    ['CreateUser', schemas.CreateUserRequest],
    ['UpdateUser', schemas.UpdateUserRequest],
    ['CreateRoleAssignment', schemas.CreateAssignmentRequest],
    ['CreateRole', schemas.CreateRoleRequest],
    ['UpdateRole', schemas.UpdateRoleRequest],
    ['CreateDepartment', schemas.CreateDepartmentRequest],
    ['UpdateDepartment', schemas.UpdateDepartmentRequest],
    ['CreateApiKey', schemas.CreateApiKeyRequest],
    ['UpdateFieldClass', schemas.UpdateFieldClassRequest],
  ] as const)('%s', (name, schema) => expectAcceptedRequest(name, schema))
})

describe('the contract check itself', () => {
  it('notices a missing field and a wrong nullability', () => {
    const missing = frontend(schemas.UserSchema.omit({ version: true }), 'output')
    const wrong = frontend(schemas.UserSchema.extend({ departmentId: z.uuid() }), 'output')

    expect(Object.keys(missing.properties ?? {}).sort()).not.toEqual(Object.keys(backend('User').properties ?? {}).sort())
    expect(shape(wrong)).not.toEqual(shape(backend('User')))
  })
})
