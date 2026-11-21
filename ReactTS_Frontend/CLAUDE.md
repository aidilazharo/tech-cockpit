# ReactTS_Frontend

React 19, Vite 8, React Router 8, TanStack Query 5, React Hook Form + Zod, Tailwind CSS 4 with AIA Qi design tokens, Base UI (unstyled behaviour/ARIA), TanStack Table 9, Zustand, i18next. Vitest 5 + Testing Library; Playwright.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` (proxies `/api` to http://localhost:3000) |
| Unit tests / watch / 99% gate | `npm test` / `npm run test:watch` / `npm run test:cov` |
| Playwright e2e | `npm run test:e2e` (API mocked in the browser; runs in the installed Edge; `PLAYWRIGHT_CHANNEL=chrome` uses an installed Chrome) |
| Real Okta sign-in e2e | `npm run test:e2e:okta` (starts backend :3000 and frontend :5173; needs `.env.e2e.local`, skips without it) |
| Lint / types / build | `npm run lint` / `npm run typecheck` / `npm run build` |
| Regenerate Qi token CSS | `npm run tokens` (after editing `design-tokens/qi-tokens.json`) |
| Regenerate Azure icons | `npm run azure-icons -- <folder>` (the unzipped "Icons" folder of Microsoft's Azure_Public_Service_Icons zip; writes `public/azure-icons`, the web app's index, the API's copy for SAD PDFs and its icon ids and names) |

On the Windows laptop:

- Long UI tests hit the 15 s timeout when files run in parallel or under coverage; run them with `npx vitest run <paths> --maxWorkers=1`, and keep new UI tests short (split long journeys).
- Coverage reports nothing when any test fails, and it deletes `coverage/` first.
- Playwright runs locally with 2 browsers at once, 60 s per journey and 10 s per check (CI keeps the defaults), and Vite transforms the app as the dev server starts (`server.warmup`). If the first journeys still fail on a cold server (blank page), rerun with `--last-failed --workers=1`.

## Structure

```
design-tokens/qi-tokens.json   Qi tokens from design.aia.com (147 colours × light/dark, shapes)
public/azure-icons/            Microsoft's Azure architecture icons (generated; terms in NOTICE.md)
scripts/                        token CSS generator
src/
  styles/qi-tokens.css          GENERATED: CSS variables + Tailwind @theme mapping (only Qi colours exist)
  index.css                     fonts (Open Sans for now), breakpoints, heading-1..4 utilities, base styles
  components/qi/                In-house Qi component library (Avatar, Button, ButtonLink, Checkbox, DataTable, DatePicker, Dialog, Dropdown, Menu, PageMessage, Pagination, SearchSelect, StatusIndicator, Tabs, Tag, Textarea, TextField, icons)
  routes.tsx                    every page (React Router data routes, lazy + permission-guarded); protected pages sit under ProtectedLayout
  components/page/              page building blocks: PageHeader, Loading/LoadFailed/ActionFailed, ConfirmDialog
  features/<feature>/           Screens; design-system/ is the living component gallery (public at /design-system)
  features/admin/               users, roles, departments, field-classes/ (field classification): schemas.ts (+ contract test vs openapi.json), queries.ts, pages
  features/me/                  My API keys
  features/approvals/           Approval Centre, approval page, out of office (yours, and others' at /admin/out-of-office), rules/ (rule maintenance editor)
  features/notifications/       header bell (polls the unread count every minute) and notifications page
  features/audit/               audit log viewer
  features/people/              PersonPicker (directory search; needs people:directory:read; actsForStaff for delegates and roadmap owners)
  features/trm/                 TRM: applications (assessment, portfolios), services, capabilities, software models, product standards, servers, sync runs, MissingRecordsPage (admins remove records ServiceNow no longer exports); parts.tsx (shared list/detail pieces), ApplicationPicker;
                                landscape/ (capability, domain, lifecycle, technology, dependencies views; colouring.ts), roadmap/ (EA roadmap, initiative editor), Timeline
  features/admin/portfolios/    portfolio list (system admins)
  features/admin/trm/           TRM domains and technology layers (system admins, enterprise architects)
  features/sad/                 SAD: list, application SAD, version view, section editor (QuestionField, TableField, RetentionField, TipTap RichTextEditor with headings, tables
                                and font sizes), compare, API inventory; logic.ts (show/hide, warnings, removed questions); VersionHistory (Version Control table),
                                LocalAuthFlag (local authentication, section 5 readers only), QuestionWarning;
                                diagrams/ (part 2 diagram slots: model.ts edits + automatic zone sizes, flow.ts → React Flow, DiagramCanvas, DiagramSlotEditor;
                                solution.tsx (solution diagram, data flow view, logical matrix), infrastructure.ts + InfrastructurePane (zones and where things sit,
                                hosting names, Copy from production), integration.tsx (integration connections, technical matrix), process.ts + ProcessPane (CI and CD flows: lanes, steps, approvers), monitoring.ts + MonitoringPane (monitoring services with the built-in list, other systems, teams), drawio/ (draw.io import: read.ts reads the file in the browser, convert.ts guesses and builds the diagram, DrawioImport the review), DiagramFiles + files.ts (files under each diagram), compare.ts + DiagramChanges + ChangeMark (version compare of diagrams: what changed per view, pictures side by side with change marks, the change list), IconPicker + icons.ts + azure-icons.ts (generated), HostingFields, parts.tsx + helpers.ts (shared pane pieces), labels.ts); azure-regions.ts;
                                calls/ (calls between applications from approved SADs: dependency.ts builds the dependency view, CallsViews: ApplicationCalls for the TRM application page
                                and the landscape Dependencies view, IncomingCalls under the solution diagram)
  features/admin/sad/           backup retention list (system admins), SAD diagram defaults (hosting names new infrastructure diagrams start with)
  auth/                         auth store, ProtectedLayout, SignInRoute, RequirePermission, useMe(), useCan()
  app-shell/                    signed-in layout: side navigation (nav-items.ts), phone drawer, avatar account menu
  test/harness.tsx              mockApi() (a FormData body is passed as is), signInWith(permissions), renderRoute(path) for page tests
  test/contract.ts              expectSameResponse / expectAcceptedRequest against NestJS_Backend/openapi.json
  lib/dates.ts                  calendar dates in Malaysia time: first day = 00:00 MYT, last day = inclusive (exclusive end next midnight)
  theme/                        light/dark/system theme store + switcher
  i18n/                         English strings (all UI text goes through keys)
  lib/                          cn(), formatMyr(), api() (cookies, problem+json, token renewal)
e2e/                            Playwright journeys (desktop, tablet, phone projects); support/a11y.ts scans with sticky bars in the page flow (a control half under them is not "too small")
e2e-okta/                       sign-in through the real Okta dev tenant (playwright.okta.config.ts)
```

## Rules

- Use Qi tokens only: `bg-surface-default`, `text-text-subdued`, `border-border-focus`, `rounded-button`... Lint blocks hex/arbitrary colours.
- Build interactive components on `@base-ui/react`; never hand-roll focus traps or keyboard handling (`qi-component` skill).
- Call the API only through `api(path, { schema })` in `src/lib/api.ts` (cookies, session renewal, problem+json → `ApiError`, response validated by the Zod schema), wrapped in TanStack Query hooks per feature.
- Every resource shape lives in the feature's `schemas.ts` and is checked against `NestJS_Backend/openapi.json` by its `contract.test.ts`.
- Hide what the user cannot do (`useCan`) and guard each page in `routes.tsx`; the API enforces permissions again.
- Tags are attributes (Vendor, System role); statuses use `StatusIndicator` (icon + text), never colour alone.
- Dates: `DatePicker` values are 'YYYY-MM-DD'; convert with `startOfDayMy` / `endOfDayMy` before sending, and show with `formatDate`/`formatDateTime` (Malaysia time).
- Pages go in `src/routes.tsx` (React Router 8; `RouterProvider` from `react-router/dom`); protected pages read the user with `useMe()`.
- Every string through i18n; money through `formatMyr`; a `null` financial value renders as "Restricted".
- Test by role and accessible name; WCAG 2.2 AA (RAG amber needs an outline/label — yellow alone fails contrast).
