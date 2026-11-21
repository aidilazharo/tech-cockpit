# TRM part 3 spec: landscape views and EA roadmap

Status: **confirmed by the product owner and built, 2026-10-22** ([build status](../requirements-decisions.md) step 10). Builds on [trm.md](trm.md) (part 1). Decisions are in [requirements-decisions.md §2](../requirements-decisions.md).

## Purpose

Show the application landscape four ways: by capability, by domain, by lifecycle and by technology layer. Hold the **EA roadmap**: initiatives with exact dates that introduce, enhance, replace or retire applications. Later, PMO business cases map to roadmap initiatives, and their timelines (planned go-live, SIT, UAT, planned retirement...) feed the lifecycle timeline. Until PMO exists, the lifecycle timeline uses the TRM plan dates built in part 1.

## New records

### Domains (configurable grouping; nothing in ServiceNow)

- **Two levels: domain → sub-domain.** Name, active. Each sub-domain belongs to one domain.
- Applications are placed **only in sub-domains**, and can be in **several** sub-domains, in the same or different domains.
- Maintained by **system admins and enterprise architects**: the domains, the sub-domains, and which applications are in them.

### Technology layers

- **Editable list**, seeded with the 10 researched layers, in this order:
  1. Channels & Presentation
  2. Business Applications
  3. Integration & APIs
  4. Data & Analytics
  5. Application Platform
  6. Infrastructure & Hosting
  7. Network & Connectivity
  8. Security & Identity
  9. Management & Operations
  10. Engineering & Delivery

  Each layer has a name, an order and an active flag.
- **Mapping:** each product-standard **standard category** (`u_standard_category`, from ServiceNow) maps to one layer (the standard category, confirmed). Categories without a mapping appear under "Not mapped".
- Maintained by **system admins and enterprise architects**.

### EA roadmap initiatives

| Field | Notes | Class |
|---|---|---|
| Name, description | required name | internal |
| Rationale / benefits | free text | internal |
| Start date, end date | exact dates; end on or after start | internal |
| Status | Proposed → Approved → In progress → Completed, or Cancelled | internal |
| Owner | a TechCockpit user | **personal** (confirmed): people's names are personal data |
| Estimated cost | **MYR** | **financial** |
| Related capabilities | any number of capabilities | internal |
| Applications | any number of actions: **introduce, enhance/modify, replace, retire**. Each names an existing application, or a **planned application** (a name, for one not yet in ServiceNow). *Replace* also names the replacement (existing or planned). The initiative's dates apply to every action (no per-application dates). | internal |

- **Planned applications:** once the real application appears in a ServiceNow export, an editor links the planned name to it, and the roadmap then points to the real application.
- **Editors:** enterprise architects and system admins. No approval; every change is audited with before and after.
- **Viewers:** a separate, configurable permission. For now it goes to every role that can view TRM. **Vendors never see the roadmap**, even if given the permission. *(Superseded 2026-10-22: roles decide for vendors too; see [rbac-configurable.md](rbac-configurable.md).)*

## Views

The capability map and the domain view share a **colour switch**:
- lifecycle status (ServiceNow install status);
- TIME rating;
- criticality;
- functional fit;
- technical fit.

Every tile also shows its value as text, and a legend explains the colours: colour is never the only signal.

1. **Capability map.**
   - The top-level capabilities form sections; level-2 and level-3 capabilities nest inside them.
   - Application tiles sit under each application's own (lowest) capability. Applications missing from ServiceNow are marked.
   - Applications with no capability, or whose capability fields don't follow the tree, are listed under "To check".
   - Clicking a tile opens the application.
   - Filters: portfolio, domain, search.
2. **Domain view.**
   - Domains, then sub-domains, then application tiles, with the same colour switch and filters.
   - An "Not in any domain" group lists the rest.
3. **Lifecycle view.**
   - **Counts per install status** at the top. Each count opens the Applications list filtered to that status.
   - **Timeline** below: one bar per application with plan dates, from planned go-live to planned retirement, marking planned phase-out and vendor end of support.
   - PMO business case timelines replace the TRM plan dates later.
4. **Technology view.**
   - One row per layer, holding **product standard tiles** (coloured by status, e.g. Standard / Restricted, with the text shown), each with the number of applications using it.
   - **Open a tile** to see its software models and the applications running each.
   - A "Not mapped" row holds standards whose category has no layer.
5. **Roadmap** (its own page).
   - Initiatives as a list with status and date filters, plus a timeline of initiatives by start and end date.
   - Each initiative's page shows its applications by action, its capabilities, owner, cost and rationale.

### Timelines (decided 2026-10-22)

The roadmap timeline and the lifecycle timeline work the same way:

- **Scale:** a year row with the months underneath (Jan, Feb, Mar...), or quarters (Q1–Q4) under each year.
- **Months | Quarters switch,** always shown. It starts on Months when the timeline covers up to 2 years, and on Quarters when it is longer; the user can change it.
- **Range:** fitted to the data, from the first month (or quarter) with a date to the last one.
- **Sideways scrolling** when the timeline is wider than the page: months and quarters keep a readable width, and the names stay in view.
- **Today:** a line labelled "Today" when today falls inside the range.
- **Legend** above the timeline. Colour is never the only signal: the text under each name says the same.

Roadmap timeline:
- One bar per initiative, from its start date to its end date.
- **Colour = status:** Proposed purple, Approved blue, In progress orange, Completed green, Cancelled grey (Qi chart colours; red is avoided).
- Under each name: the status, and the exact dates ("01/10/2026 to 31/10/2026").

Lifecycle timeline:
- One bar per application with plan dates, split into **lifecycle phases**:
  - **In use:** planned go-live to planned phase-out (to planned retirement when there is no phase-out date).
  - **Phasing out:** planned phase-out to planned retirement.
- **Vendor end of support** is a labelled mark.
- **A missing date fades the open end:** the bar runs to the edge of the timeline and fades out on that side; the text shows "—" for it.
- Under each name: the four plan dates, as before.

Vendors see the capability map, domain view, lifecycle view and technology view only for their own applications, as with all TRM data. They never see the roadmap. *(Superseded 2026-10-22: roles decide for vendors too; see [rbac-configurable.md](rbac-configurable.md).)*

## Permissions (proposed codes)

| Action | Permission | Seeded to |
|---|---|---|
| View the landscape views | `trm:application:read` (existing) | (existing TRM roles) |
| Maintain domains and assign applications | `trm:domain:manage` | enterprise architect |
| Maintain technology layers and the category mapping | `trm:layer:manage` | enterprise architect |
| View the roadmap | `trm:roadmap:read` | every role with `trm:application:read` |
| Create and change roadmap initiatives, link planned applications | `trm:roadmap:manage` | enterprise architect |

System admins hold every permission.

## Later (PMO)

- A business case maps to one or more roadmap initiatives.
- The business case's timeline (planned go-live, SIT, UAT, planned retirement...) feeds the lifecycle timeline of the applications involved.

## Confirmed 2026-10-22

1. The roadmap owner's name is personal data.
2. Layers map from the product standards' standard category.
3. The permission codes and seeding above.
4. Lifecycle counts open the Applications list, filtered by status.
