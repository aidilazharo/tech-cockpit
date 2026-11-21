# Enterprise Technology Reference Model (TRM) for TechCockpit

Research date: 2026-10-21. Covers what an enterprise TRM contains, a proposed data model, landscape views, how ServiceNow data feeds it, and a baseline SAD structure.

## 1. What an enterprise TRM is

A TRM is the organisation's **single, structured inventory of its technology**: which business capabilities exist, which applications support them, what technology they run on, how they connect, who owns them, and where each one is in its lifecycle. Architects use it to answer questions such as "which applications does this project touch?", "what still runs on an end-of-life database?", and "where do we have three applications doing the same job?".

The design below draws on four reference points:

| Source                                                                                      | What we take from it                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TOGAF Technical Reference Model** (published as a TOGAF Series Guide in the 10th edition) | A taxonomy of technology services in layers (application software, application platform services, communications infrastructure) plus cross-cutting qualities such as security and manageability. We use it as the starting point for the **technology layer** categories.                                                                                                                                      |
| **ServiceNow CSDM 5**                                                                       | How your source data is shaped: business applications, business services, application services and their relationships. CSDM 5 groups these into seven conceptual domains (Foundation, Ideation & Strategy, Design & Planning, Build & Integration, Service Delivery, Service Consumption, and others). **Table names are the stable identifiers**, because CSDM 5 renamed some labels without renaming tables. |
| **ACORD Capability Model** (insurance industry)                                             | A ready-made insurance business capability map: ten top-level capabilities broken into three further levels. It's available to ACORD members and subscribers. Used only if your own capability model has gaps.                                                                                                                                                                                                  |
| **Common EA-tool practice** (LeanIX, Ardoq, ServiceNow APM)                                 | Lifecycle phases, invest/tolerate/migrate/eliminate (TIME) assessment, capability heatmaps and interface maps as the standard landscape views.                                                                                                                                                                                                                                                                  |

## 2. Proposed TRM data model

```
Business Capability (L1 → L2 → L3, your model)
        │ supported by (many-to-many, with fit rating)
        ▼
Business Application  ◄── ServiceNow cmdb_ci_business_app (read-only fields)
        │ deployed as                        │ owns
        ▼                                    ▼
Application Service ◄── cmdb_ci_service_auto     Owner / Team / Department
        │ underpins                          │ supplied by
        ▼                                    ▼
Business Service ◄── cmdb_ci_service_business   Vendor (Vendor Management)

Business Application ── uses ──► Technology Component (product + version, e.g. "PostgreSQL 15")
Technology Component ── classified in ──► TRM Category (technology layer taxonomy)
Business Application ── Interface ──► Business Application   (protocol, pattern, data classification)
Business Application ── has ──► SAD (one living SAD, versioned)
Project (PMO) ── impacts ──► Business Application (new / modified / integrated / decommissioned)
```

Every ServiceNow-sourced entity stores its `sys_id`, the **source fields (read-only)**, **TRM-only fields** (never touched by sync), `last_seen_sync_run_id`, and `missing_since` (set when a complete sync no longer finds it).

### TRM-only attributes (proposal — you confirm the list)

| Attribute                                              | Values                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle phase + dates                                | Plan · Phase-in · Active · Phase-out · Retired                                                                                              |
| TIME rating                                            | Tolerate · Invest · Migrate · Eliminate                                                                                                     |
| Business criticality                                   | e.g. Mission-critical · Business-critical · Business-operational · Administrative (align with your BNM RMiT critical-system classification) |
| Functional fit / technical fit                         | 1–4 scale, used for heatmaps                                                                                                                |
| Technology standard status (for Technology Components) | Emerging · Standard · Contained (no new use) · Retiring · Prohibited                                                                        |
| Capability mapping                                     | Many-to-many to L2/L3 capabilities, with primary flag                                                                                       |

## 3. Technology layer taxonomy (draft, adapted from TOGAF TRM)

| L1 layer                 | Example L2 categories                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Channels & Presentation  | Web portals, mobile apps, agent/adviser tools, contact centre                                              |
| Business Applications    | Core policy admin, claims, underwriting, CRM, finance, HR (business view comes from your capability model) |
| Integration & APIs       | API gateway, ESB/iPaaS, messaging/event streaming, file transfer (SFTP/MFT), B2B/EDI                       |
| Data & Analytics         | Operational databases, data warehouse/lakehouse, BI/reporting, master data, data quality                   |
| Application Platform     | Runtimes (Java, .NET, Node), app servers, containers/Kubernetes, low-code, workflow/BPM                    |
| Infrastructure & Hosting | On-prem compute, private cloud, public cloud (Azure/AWS), storage, backup                                  |
| Network & Connectivity   | WAN/LAN, load balancers, DNS, CDN, VPN, network security zones                                             |
| Security & Identity      | IAM/SSO (Okta), PAM, secrets/key management, WAF, SIEM, vulnerability management, DLP                      |
| Management & Operations  | ITSM (ServiceNow), monitoring/observability, logging, configuration/CMDB, job scheduling                   |
| Engineering & Delivery   | Source control, CI/CD, artifact registry, testing tools, code quality and security scanning                |

Your capability model provides the **business view**. This taxonomy provides the **technology view**. The two meet at Business Application.

## 4. Landscape views (all four selected)

| View                        | What it shows                                                            | Notes                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Business capability map** | L1 capabilities as columns, L2/L3 nested, applications as tiles inside   | Colour by a chosen measure: TIME, lifecycle, criticality, technical fit, "missing from ServiceNow" flag, or (later) cost. Shows gaps and overlaps. |
| **Domain / department**     | Applications grouped by owning department or domain                      | Same tiles and colouring; filters by owner.                                                                                                        |
| **Lifecycle**               | Timeline bars per application (phase-in → retired) plus counts per phase | Needs TRM-only lifecycle dates. Flags apps in Phase-out still used by active projects.                                                             |
| **Technology layer**        | Layers as rows, technology components as tiles, applications using each  | Shows exposure to Retiring/Prohibited technologies.                                                                                                |

Shared behaviour: one filter bar (department, capability, lifecycle, criticality, vendor, text search), click-through to the application detail page (ServiceNow data, TRM attributes, SAD, interfaces, projects), and export to Excel/PNG. An **interface map** (React Flow graph of application-to-application interfaces) and a **project impact view** come from the SAD and PMO modules.

## 5. ServiceNow → TRM mapping

| ServiceNow table                              | TRM entity           | Key                                              |
| --------------------------------------------- | -------------------- | ------------------------------------------------ |
| `cmdb_ci_business_app`                        | Business Application | `sys_id`                                         |
| `cmdb_ci_service_business`                    | Business Service     | `sys_id`                                         |
| `cmdb_ci_service_auto` (and child classes)    | Application Service  | `sys_id`                                         |
| `cmdb_rel_ci` (filtered to the classes above) | Relationships        | `sys_id` (parent, child, type kept as delivered) |

Field lists will be fixed after the first export from your instance and your relationship model. All ServiceNow fields are **read-only** in TRM.

## 6. ServiceNow sync CLI design

> **Superseded 2026-10-22:** the product owner's Node export application already produces the ServiceNow JSON files (see [servicenow-samples.md](servicenow-samples.md)). TechCockpit only loads them; the Playwright-session exporter below is not built. The server-side rules (upsert, never delete, missing flag, audit) still apply.

Decisions applied: Playwright session only; personal TechCockpit API key; upsert, never delete; flag missing records.

```
techcockpit-sn-sync (npm CLI, separate folder)
  1. Launch browser   → Edge on Windows (channel 'msedge'), visible window
  2. User signs in    → ServiceNow via Okta/MFA; CLI waits until a ServiceNow page loads
  3. Get CSRF token   → read window.g_ck from a classic UI page (exact page confirmed on your instance)
  4. Export           → browserContext.request.get('/api/now/table/<table>', …) with header X-UserToken
                        sysparm_fields, sysparm_limit (e.g. 1000), sysparm_offset, sysparm_display_value=all,
                        sysparm_exclude_reference_link=true; page until X-Total-Count is reached
  5. Close browser    → session cookies never written to disk or logs
  6. Push             → POST /api/v1/trm/sync-runs                         (start run, per table)
                        PUT  /api/v1/trm/sync-runs/{runId}/records          (batches of N records)
                        POST /api/v1/trm/sync-runs/{runId}/complete         (record count + checksum)
                        Header: Authorization: Bearer <personal API key>  (key needs the trm:sync permission)
  7. Report           → inserted / updated / unchanged / newly-missing counts; non-zero exit on failure
```

Server-side rules:

- **Upsert**: `INSERT … ON CONFLICT (sn_sys_id) DO UPDATE` only when a content hash changed. Unchanged rows are not touched, so audit stays clean.
- **Missing records** are flagged only when a run **completes** with a full, unfiltered export whose count matches `X-Total-Count`. A failed or partial run never flags anything. This prevents mass-flagging when a network error cuts an export short.
- **Every run is audited**: who ran it, when, which tables, counts.
- The endpoints are idempotent, so re-pushing the same batch is safe.
- `--dry-run` shows the changes without writing them.

Why `browserContext.request` instead of copying cookies: Playwright's request API shares cookie storage with the signed-in browser context. The CLI never has to extract, store or log the session cookie itself.

Risks to accept consciously:

- The sync runs with **your own ServiceNow permissions** and only while someone is there to sign in. It can't be scheduled.
- Reusing a browser session for API calls is **unofficial**. A ServiceNow upgrade or session-policy change can break it. Check with the ServiceNow platform owner that this use is acceptable.
- `g_ck` handling differs between UI versions. The exact page is confirmed during the build.

## 7. SAD baseline structure (draft — research, then adapt)

One living SAD per business application, versioned, approved through the configurable workflow. Sections marked **🔒** are restricted (SAD security data).

| #    | Section                 | Contents                                                                                                                                                                 |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Overview                | Purpose, business owner, IT owner, users, business criticality, linked capabilities (from TRM)                                                                           |
| 2    | Architecture overview   | Logical diagram (React Flow), components, key design decisions                                                                                                           |
| 3    | Environments & servers  | Per environment (Prod, DR, UAT, SIT, Dev): hosting, servers/instances, OS, sizing, location, network zone                                                                |
| 4    | Technology stack        | Technology Components from TRM, with versions and standard status                                                                                                        |
| 5    | Integrations            | Interfaces to other applications: direction, pattern, protocol/port, data classification, authentication, encryption (same fields as solution diagrams)                  |
| 6    | Data                    | Data classification, personal data held (PDPA), residency, retention, archival                                                                                           |
| 7 🔒 | Security                | Authentication (Okta/other), authorisation model, encryption in transit and at rest, secrets management, vulnerability and penetration-test status, last assessment date |
| 8 🔒 | Application RBAC        | Roles and permissions, privileged accounts, segregation of duties, access review frequency, last review date                                                             |
| 9    | Backup & recovery       | Backup scope, frequency, retention, location, last restore test, RPO/RTO                                                                                                 |
| 10   | Resilience & DR         | HA design, DR site and strategy, last DR test date and result                                                                                                            |
| 11   | Monitoring & operations | Monitoring, logging, alerting, support groups (ServiceNow), on-call, vendor support and SLA                                                                              |
| 12   | Compliance              | Regulatory mapping (BNM RMiT critical-system classification, PDPA, ISO 27001 controls), outstanding audit findings                                                       |
| 13   | Risks & technical debt  | Known risks, end-of-life components, remediation plan                                                                                                                    |
| 14   | Change history          | Auto-generated from SAD versions and approvals                                                                                                                           |

Fields will be structured (tables and typed fields, not free text) wherever the Control Tower needs to report on them. Examples: last DR test date, end-of-life components, overdue access reviews.

## 8. What I need from you

1. Your **business capability model** (any format).
2. Your **relationship model** between business applications, business services and application services.
3. **Confirm the TRM-only attributes** in section 2 (add or remove).
4. **Confirm the draft taxonomy** in section 3 and the **SAD sections** in section 7.
5. Approximate **record counts** per ServiceNow table and your **ServiceNow release**.

## Sources

- [ServiceNow docs — CSDM data domains](https://www.servicenow.com/docs/r/zS6yb8e~gR8BPjeviYdV9g/YO9~nS73A2CUXGgC7Mjz6g)
- [ServiceNow docs — Service Delivery domain in CSDM](https://www.servicenow.com/docs/r/zS6yb8e~gR8BPjeviYdV9g/t6w6O0jNKpKNIBSyO0AISg)
- [ServiceNow docs — Relationships between CSDM objects](https://www.servicenow.com/docs/r/UUPLjuAXTo4SlQO8Ml6ZjQ/7YUcVy3vgl35fsGte05JzA)
- [ServiceNow docs — Configuring relationships between CSDM objects](https://www.servicenow.com/docs/r/Fh_8fL03pu2DUFUbNbQAvw/AMcTn2V3hJZHJaOpFuS26A)
- [ServiceNow Community — Top features of CSDM 5](https://www.servicenow.com/community/common-service-data-model-forum/top-features-of-csdm-5-what-you-need-to-know/td-p/3294791)
- [Serac Labs — CSDM modeling notes](https://www.typingmind.com/skills/serac-labs-csdm-modeling)
- [ACORD Reference Architecture](https://www.acord.org/standards-architecture/reference-architecture), [Capability Model update (2025)](https://acord.org/news-detail/2025/05/21/acord-reference-architecture-updates-capability-model-business-glossary), [interactive models (2026)](https://acord.org/news-detail/2026/01/29/acord-releases-interactive-online-versions-of-reference-architecture-models)
- [ServiceNow Community — REST Table API session reuse](https://www.servicenow.com/community/developer-forum/rest-table-api-session-reuse-for-multiple-request/m-p/1589847)
- [ServiceNow Community — 401 with X-UserToken](https://www.servicenow.com/community/secops-forum/servicenow-rest-api-throwing-error-401-unauthorized/m-p/1282801)
