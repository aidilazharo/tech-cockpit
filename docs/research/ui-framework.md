# UI Framework for TechCockpit (React) — built on AIA Qi

Research date: 2026-10-21. Qi details read from design.aia.com the same day; package versions and licences checked on npm.

## Recommendation

Build TechCockpit's own **Qi component library in Tailwind CSS 4**, styled only with Qi design tokens. Use **Base UI** (`@base-ui/react`) underneath the interactive components purely for behaviour and accessibility.

- **All visuals are ours.** Base UI ships **no styles at all**: no colours, spacing or shapes. Every pixel comes from Tailwind classes mapped to Qi tokens, so the components look like AIA Qi and nothing else.
- **Accessibility is the reason for Base UI.** Getting dialogs, dropdowns with search, date pickers, tabs, tooltips, sliders and menus right by hand is a known source of bugs. They need focus trapping, keyboard navigation, screen-reader roles and announcements. Base UI provides these correctly, which is the hard part of WCAG 2.2 AA.
- **Simple components are plain Tailwind + semantic HTML**: button, badge, tag, card, avatar, list, breadcrumb, pagination, skeleton, empty state, page-level message.
- **No shadcn/ui and no styled library** (MUI, Mantine, Ant Design). Their visual language would fight Qi.

Base UI: v1.9.0, MIT, from the MUI team, frequent releases; shadcn/ui switched to it as its default in July 2026, a sign of strong adoption.

## What Qi provides (from design.aia.com)

### Foundations

| Foundation | Qi definition |
|---|---|
| **Colour** | Primary: Digital red 500, Digital charcoal 600, white. Digital red never exceeds 20% of a layout; used for primary CTAs. 10 red and 10 charcoal tints. Secondary palettes (salmon, purple, warm grey; 7 tints each) only for component surfaces, charts and illustrations. |
| **Semantic tokens** | **147 colour tokens, each with a light and a dark value**, covering text, surface, icon, border, divider, buttons, cards, tags, switch, page-level messages, rating, tabs, skeleton and data visualisation. **Dark mode is fully defined.** |
| **Typography** | Headings: **AIA Everest** (proprietary brand font). Body: **Open Sans**. **Noto Sans** for other languages. English heading sizes h1–h6: 48/40/32/28/24/20 px desktop, 32/28/24/22/20/18 px on mobile (<768 px). Weights 400 / 600 / 700. |
| **Spacing** | 4 px soft grid: every spacing value divisible by 4, aligned to 8 px. Tighter spacing for dense information. |
| **Grid & breakpoints** | 12-column grid. Frames: mobile 375×812, tablet portrait 768×1024, tablet landscape 1024×768, desktop 1440×900. |
| **Shape** | Radius none/sm/md/lg/round = 0 / 4 / 8 / 16 px / pill. Buttons, cards, chips, inputs 8 px; overlays 16 px; tags pill. Border widths 1 / 2 / 3 / 4 px. |
| **Elevation** | Shadow levels, tonal difference and scrim (described, not tokenised). Floating buttons get the highest elevation. |
| **Iconography** | Actionable (monochrome line), status (success / warning / error / information) and product-category icons. **Only icons from the AIA icon library.** |
| **Content** | Tone of voice, inclusive writing (gender-neutral, people-first, lower-secondary reading level), alt-text rules. |

All extracted tokens are saved in [qi-tokens.json](qi-tokens.json) (147 light + 147 dark colour tokens, 21 shape tokens, English typography, spacing, breakpoints).

### Components Qi defines (36)

| Group | Components |
|---|---|
| Action | Button (primary / secondary / tertiary, with icon, underline), Button group, Floating button |
| Data display | Accordion, Avatar, Badge, Card, Carousel, List, List item, Status indicator, **Table** (plain, sectioned, striped, with navigation, actions, selection, inputs), Tag, Tooltip |
| Feedback | Activity indicator, **Dialog** (information, interactive, alert), Empty state, Page-level message, Skeleton, Snackbar, System alert |
| Form | Checkbox, Chip, **Date picker** (DD/MM/YYYY or MM/YYYY, typed or calendar), **Dropdown** (simple, grouped, with search, multi-select), Input, Radio, Rating, Slider, Switch, Textarea, **Uploader**, Value stepper |
| Navigation | Breadcrumb, Pagination, Tabs |

### What TechCockpit needs that Qi doesn't define

Qi is aimed at customer apps (AIA+). An internal enterprise tool needs more. These will be designed **in Qi's visual language** (same tokens, radius, spacing, type) and reviewed with your design team:

| Needed component | Used for | Built with |
|---|---|---|
| App shell: side navigation, top bar, user menu | Every page | Tailwind + Base UI Menu |
| **Data grid**: sorting, filtering, column resize/hide, sticky header, virtual scroll, export | TRM lists, financials, Approval Centre | TanStack Table, styled as the Qi Table |
| **Approval timeline / stepper** | Business case, ARB, SAD approval status ("where is it stuck") | Tailwind |
| Drawer / side sheet | Record details without leaving a list | Base UI Dialog |
| Popover, menu, context menu | Row actions, filters | Base UI |
| Tree view | Capability hierarchy (L1–L3) | Tailwind + ARIA tree pattern |
| Capability heatmap and landscape tiles | TRM landscape views | Tailwind + Qi data-visualisation level tokens |
| Charts | Control Tower | Recharts, coloured with Qi `data-visualisation-*` tokens (Qi already defines chart palettes) |
| Diagram canvas | Solution and network diagrams | React Flow, themed with Qi tokens |
| RAG status chip | Monthly reporting, Control Tower | Qi Status indicator + tokens (see accessibility note) |

## Accessibility check of Qi colours (WCAG 2.2 AA)

Contrast ratios calculated from the Qi tokens:

| Pair | Ratio | Result |
|---|---|---|
| Default text on white | 17.84 | Pass |
| Subdued text on white / on alternate surface | 5.18 / 4.76 | Pass |
| Link (digital red) on white | 4.90 | Pass |
| White on primary button / hover | 4.90 / 7.01 | Pass |
| Error text on white | 5.12 | Pass |
| Default border on white | 3.44 | Pass for UI components (needs ≥3) |
| Focus ring on white / on dark surface | 5.08 / 3.51 | Pass |
| Dark mode: text, subdued, link, error | 17.84 / 8.27 / 4.71 / 4.94 | Pass |
| Success icon on white (RAG green) | 3.38 | Pass for icons only, not text |
| **Warning icon on white (RAG amber)** | **1.57** | **Fails** the 3:1 minimum for non-text elements |

Consequences:

- **RAG Amber in light mode** must never be the yellow alone. It needs a dark outline or dark icon glyph plus a text label ("Amber"). Every RAG indicator carries a text label anyway, so colour is never the only signal (WCAG 1.4.1).
- Success green is fine for icons and badges, but body text uses `text-positive` (5.00).

Other WCAG 2.2 AA rules for the build: visible focus not hidden behind sticky headers, minimum target size 24×24 px, keyboard and button alternatives to dragging (React Flow diagrams), consistent help placement, no cognitive tests at login (Okta handles authentication). Every page gets an automated axe-core scan in Playwright.

## How the tokens become Tailwind

1. `qi-tokens.json` → generated `src/styles/qi-tokens.css`: light values on `:root`, dark values under `[data-theme="dark"]` and `prefers-color-scheme: dark`.
2. Tailwind 4 `@theme` exposes them as utilities: `bg-surface-default`, `text-text-subdued`, `border-border-focus`, `bg-button-primary-surface`, `rounded-md`, and so on.
3. Components use **only** these utilities. A lint rule blocks raw hex colours and arbitrary values in component code.
4. A unit test re-checks every text/surface token pair for AA contrast whenever tokens change.

## Supporting libraries (all open source)

| Need | Library | Latest | Licence | Note |
|---|---|---|---|---|
| Accessible behaviour primitives | @base-ui/react | 1.9.0 | MIT | Unstyled; behaviour and ARIA only |
| Data grid logic | @tanstack/react-table | 9.3.1 | MIT | Headless; rendered as Qi Table |
| Server state / API calls | @tanstack/react-query | 5.104.2 (installed) | MIT | Responses validated with per-feature Zod schemas, checked against openapi.json by a contract test. OpenAPI code generators were rejected on 2026-10-21: openapi-typescript 7.13 requires TypeScript 5 (we use 6) and @hey-api/openapi-ts 0.99 pins a js-yaml with 3 high advisories |
| Forms + validation | react-hook-form + @hookform/resolvers + zod | 7.90.0 / 5.9.1 / 4.6.7 (installed) | MIT | resolvers 6.0.0 was inside the 7-day cooldown |
| Date picker calendar | react-day-picker | 10.0.2 (installed) | MIT | Unstyled, accessible keyboard grid; styled with Qi tokens inside a Base UI Popover |
| Charts | recharts | 3.10.1 | MIT | Qi chart palette tokens |
| Diagrams | @xyflow/react | 12.12.0 | MIT | React Flow |
| Diagram auto-layout | @dagrejs/dagre | 3.1.1 | MIT | Not elkjs (EPL-2.0 / GPL-3.0) |
| draw.io import | fast-xml-parser + pako | 5.11.2 / 3.0.2 | MIT / MIT+Zlib | Server-side parsing |
| i18n | react-i18next | 17.1.0 | MIT | English now |
| Routing | react-router | 8.4.0 (installed) | MIT | Chosen 2026-10-21 (data mode); 8.5.0 was inside the 7-day cooldown |
| Client state | zustand | 5.x (installed) | MIT | UI state only |
| Accessibility tests | @axe-core/playwright | 4.14.0 | MPL-2.0 | Dev-only; confirm licence policy |
| API mocking in tests | msw | 3.0.3 | MIT | |
| Icons | **AIA icon library** | — | AIA | Qi requires it; lucide-react (ISC) only as a stop-gap |

## What I need from you / your design team

1. **AIA Everest font files** (web formats, e.g. WOFF2) and confirmation that internal tools may use them. Open Sans and Noto Sans are open-licensed and can be self-hosted.
2. **AIA icon library** (SVG set), at least the actionable and status icons.
3. **Qi Figma library** (or access to it) for component specs: sizes, padding, states, shadow values. The public site has usage guidance but not pixel specs or shadow values.
4. Whether a **Qi code library** already exists internally. The components page mentions "code demos", which aren't visible publicly. If one exists for React or web components, reusing it may save effort.
5. A **Qi designer contact** to review the components Qi doesn't define (data grid, side navigation, approval timeline, heatmap).

## Sources

- [AIA Design — Qi design system](https://design.aia.com/aia-qi-design-system), [Foundations](https://design.aia.com/foundations), [Colour](https://design.aia.com/colour), [Typography](https://design.aia.com/typography), [Spacing](https://design.aia.com/spacing), [Grid and layout](https://design.aia.com/grid-and-layout), [Shadow](https://design.aia.com/shadow), [Iconography](https://design.aia.com/iconography), [Inclusivity](https://design.aia.com/inclusivity), [Components](https://design.aia.com/components) — read 2026-10-21; tokens taken from the site's own stylesheet.
- [shadcn/ui changelog — July 2026, Base UI as the default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)
- [PkgPulse — shadcn/ui vs Base UI vs Radix (2026)](https://www.pkgpulse.com/guides/shadcn-ui-vs-base-ui-vs-radix-components-2026)
- [Dualite — Best UI component libraries in 2026](https://dualite.dev/blogs/best-ui-component-libraries)
- [UXPin — Best React component libraries 2026](https://www.uxpin.com/studio/blog/top-react-component-libraries/)
- [Untitled UI — React component libraries 2026](https://www.untitledui.com/blog/react-component-libraries)
- [Mantine 9.0.0 changelog](https://mantine.dev/changelog/9-0-0/)
- [CoreUI — AG Grid alternatives compared (2026)](https://coreui.io/compare/ag-grid-alternative/)
- npm registry metadata for every package version and licence above (queried 2026-10-21).
