# Backend module layout (NestJS 12)

## Contents
- Folder layout
- Schemas (Zod) and OpenAPI
- Service
- Controller
- Tests
- Audit
- Module registration

## Folder layout

```
NestJS_Backend/src/modules/<module>/
  <entity>.entity.ts            defineEntity (see database.md)
  <module>.permissions.ts       definePermissions({...})
  <module>.schemas.ts           Zod request/response schemas + inferred types
  <logic>.ts / <logic>.spec.ts  pure domain rules (aim for 100% coverage)
  <module>.service.ts / .spec.ts
  <module>.controller.ts
  <module>.module.ts
NestJS_Backend/test/e2e/<module>.e2e-spec.ts
```

Imports use `.js` extensions (Node ESM). No default exports.

## Schemas and OpenAPI

```ts
export const CreateThingSchema = z.object({
  title: z.string().trim().min(1).max(200),
}).strict().meta({ id: 'CreateThing' });
export type CreateThing = z.infer<typeof CreateThingSchema>;

export const ThingSchemaOut = z.object({
  id: z.uuid(), title: z.string(), status: z.enum(THING_STATUSES),
  estimatedCost: z.string().nullable(), // financial: null when the caller may not see it
}).meta({ id: 'Thing' });
```

- `.strict()` on every request body: unknown fields are rejected (mass-assignment protection).
- Response schemas list every field explicitly; the response interceptor strips anything else.

## Service

- Inject `EntityManager` (request-scoped via MikroORM `RequestContext`).
- Take the `Principal` as the first argument of every public method; check scope with `principal.can(permission, scope)`; throw `ForbiddenException` otherwise.
- Mask classified fields with `maskClassified(...)` from `src/modules/access/data-visibility.ts` before returning.
- Set `createdBy`/`updatedBy` from the principal.
- Record changes with `AuditService.recordChange(...)` (before/after).

## Controller

```ts
@ApiTags('Things')
@Controller({ path: 'things', version: '1' })
export class ThingController {
  constructor(private readonly things: ThingService) {}

  @Post()
  @RequirePermission('things:thing:create')
  @ZodResponse({ status: 201, schema: ThingSchemaOut, description: 'Created' })
  create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateThingSchema) body: CreateThing) {
    return this.things.create(principal, body);
  }
}
```

Every route has: `@RequirePermission(code)` (or `@Authenticated(reason)` / `@Public(reason)`), Zod-validated inputs (`@ZodBody`, `@ZodQuery`, `@ZodParam`), and `@ZodResponse` for each success status (status must match `@HttpCode`, or the serializer fails closed). Put `@AuditResource('<resource>')` on the controller. Errors are problem+json via the global filter.

## Tests

- Unit (`*.spec.ts`, next to the code): domain rules and service logic with fakes. Cover each branch.
- e2e (`test/e2e/*.e2e-spec.ts`): real app + real `<DB_SCHEMA>_test` database via supertest. For every route test at least: success; 401 without credentials; 403 without permission; 403/404 outside the caller's scope; 400 invalid body; masking of classified fields for a role that may not see them; a role without the data access (e.g. the seeded Vendor role) never sees restricted fields.
- Helpers: `test/e2e/support/app.ts` (boots the app), `test/e2e/support/actors.ts` (creates users with roles and API keys).

## Audit

Views are recorded automatically by the audit interceptor. Services record changes explicitly with before/after values. Never put secrets or full documents in audit metadata.

## Module registration

Add the module to `AppModule.imports` and its permissions to the catalogue. Run `npm run db -- check`.
