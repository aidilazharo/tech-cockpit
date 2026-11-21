---
name: ui-screen
description: Builds TechCockpit React screens in the AIA Qi design language — Qi tokens only, reuse of the in-house Qi Tailwind component library, WCAG 2.2 AA, light/dark themes, desktop-first responsive down to tablet and phone, i18n keys, MYR formatting, TanStack Query for API data. Use when creating or changing any page, screen, layout, form or dashboard in ReactTS_Frontend.
---

# Build a screen

```
Screen progress:
- [ ] 1. Layout and states agreed (loading, empty, error, forbidden, success)
- [ ] 2. Component tests written first (tdd-cycle)
- [ ] 3. Built from src/components/qi only; new components via the qi-component skill
- [ ] 4. Data via TanStack Query + `api(path, { schema })` with the feature's `schemas.ts` (checked by its contract test)
- [ ] 5. Text via i18n keys; money via formatMyr
- [ ] 6. Light + dark + tablet + phone checked
- [ ] 7. Playwright journey (e2e-tests skill)
```

## Rules

- **Tokens only**: Tailwind classes from the Qi theme (`bg-surface-default`, `text-text-subdued`, `border-border-default`, `rounded-button`, spacing in steps of 4 px). Lint blocks hex and arbitrary colour values; use arbitrary layout values (`max-w-[...]`) only when no token or scale step fits.
- **Digital red ≤ 20% of a layout**: one primary button per section; red is for primary actions and key navigation only.
- **Typography**: headings use the heading font token, body Open Sans; heading sizes from the Qi scale (they shrink below 768 px).
- **Layout**: 12-column grid; frames 1440 desktop, 1024/768 tablet, 375 phone. Approval Centre and dashboards must be usable on tablet and phone.
- **States**: every data view has loading (skeleton), empty (Qi empty state), error (page-level message with retry) and forbidden states.
- **Classified data**: when the API returns `null` for a financial field the user may not see, show "Restricted" (i18n), never `0` or blank.
- **RAG**: always colour + icon + text label. Amber in light mode uses a dark outline/glyph (yellow alone fails contrast).

## Accessibility (WCAG 2.2 AA)

- One `h1` per page; headings in order; landmarks (`header`, `nav`, `main`).
- Every control has an accessible name; icons-only buttons have `aria-label`.
- Visible focus never hidden behind sticky headers; targets ≥ 24×24 px.
- Drag interactions (React Flow diagrams) have a keyboard/button alternative.
- Colour is never the only signal.

## Routing

- React Router 8 (data mode). Add the page to `src/routes.tsx`, under `ProtectedLayout` unless it is deliberately public. `RouterProvider` comes from `react-router/dom`; everything else from `react-router`.
- Inside protected pages get the signed-in user with `useMe()` (`src/auth/use-me.ts`); hide entry points the user lacks permissions for, and show the forbidden state when the API answers 403.
- Navigate with `<Link>` / `useNavigate`; never `window.location` (sign-in to Okta is the only full-page navigation).
- Route tests use `renderRoute(path)` from `src/test/harness.tsx` (a memory router over the real `routes`, with `mockApi` and `signInWith`).

## Data and state

- Server data: TanStack Query hooks per resource (`useThings`, `useCreateThing`) that call `api()` from `src/lib/api.ts` (cookies, session renewal, problem+json errors), invalidated after mutations.
- Client-only UI state: Zustand, kept small.
- Forms: React Hook Form + Zod; field errors under the field (Qi input error state), summary page-level message for submit errors.
