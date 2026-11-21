# PMO

Status: **being specified with the product owner** (started 2026-10-26). Decisions are recorded here as they are made; nothing is built until each slice's spec is confirmed.

**Continued on the Windows company laptop** (decided 2026-10-26), where the full business case PowerPoint and Excel financial calculator are available: read them there before specifying the business case, and keep them in `docs/template/bizcase/` (git-ignored).

Source material: AIA's "Digital Business Case Form Specification" (15 pages, derived from a sample case's PowerPoint and Excel financial calculator), the approval matrix by request type and amount, and the list of functional reviewers. They are AIA confidential and kept out of git (`docs/template/bizcase/`, ignored); this file records what we agree from them.

Next questions to ask (rounds 1–4 answered 2026-10-27). Still open: the reviewer roles (FD & TOPD, PAG, which director fills which functional review), which depends on the approval matrix retake below. Then, before each later slice, its own details: the business case form fields (the 15-page form specification has not arrived yet), the approval chain, the monthly report and closure.

## Decided

From `requirements-decisions.md` §4 (2026-10-21):

- Hierarchy **Portfolio → Stream → Project**.
- **PM ↔ portfolio lead** reporting lines maintained in the app.
- Business case approval amount basis: ~~total cost of ownership (TCO)~~ **superseded on 2026-10-27**: now the implementation cost for this request (see below).
- Uploads: Word, Excel, PowerPoint, PDF, PNG, JPG, Visio (.vsdx), draw.io; no SVG or ZIP; 25 MB; Defender malware scan when deployed.
- Monthly report: milestones; budget vs actual vs forecast per cost category; risks and issues. RAG status derived from milestone slippage and budget variance (thresholds maintained), PM may override with a reason. PMO sets the cut-off, reminders before, overdue escalates to the portfolio lead. Actuals typed by the PM and bulk-uploaded from Excel by PMO (PMO may override).
- Closure: final cost vs budget, benefits vs planned, lessons learned, handover / TRM and SAD update; configurable approval workflow.

2026-10-26:

- **A project comes first**; its business case is a stage of the project.
- Business cases are raised (drafted and submitted) by the **product manager, project manager or portfolio lead**.
- A **stream** is a workstream inside one portfolio, led by a workstream lead.
- Portfolios, streams and the PM ↔ portfolio lead assignments are maintained by **PMO and system admins**.

2026-10-27 (round 1, after reading the business case PowerPoint and the Financial Calculator (file v1.9 (Y26), internal log v1.7)):

- **First slice to build: structure + project** (Portfolio → Stream → Project, people, classification lists, statuses). The business case, monthly report and closure hang off the project.
- **Cost categories are the SAP ZGOE expense types**, each line tagged CAPEX or OPEX; this replaces the four categories decided on 2026-10-21 (and the "per cost category" in the monthly report now means ZGOE type):
  - [A] Salaries & Employee Benefits, [B] Depreciation and Amortisation, [C] Rent and Related, [D] Corporate Advertising, [E] Travel, [F] Professional and Consulting Fees, [G1] Software Licences, [G2] Hosting, Infrastructure, Maintenance, [G3] Others (IT), [H] Other Operating Expenses, [I] Inter-company Fees. G1–G3 all map to SAP code ZGOE-G.
  - The list stays admin-maintained. Each category also carries a People / Vendor / Other cost class for the pre/post BAU comparison (the calculator's Ref sheet maps its 12 item categories, such as AIA Resources, Data Communication, Vendor / Contract Tech Resources, to a ZGOE type and a cost class).
- **A PM's portfolio lead** comes from the explicit PM ↔ portfolio lead list maintained by PMO and system admins; every project of that PM follows it.
- **Non-financial project details** (name, description, status, people, milestones, risks) are visible **by portfolio**: people in a portfolio see all its projects, others see none. Financial data stays role-controlled (vendors see none unless their role grants it).

2026-10-27 (round 2, structure and project):

- **Placement:** every project has exactly one portfolio and exactly one stream.
- **A project records:** name, description, portfolio, stream; **people** (product manager, project manager, sponsor / business owner; the workstream lead and portfolio lead come from the structure); **dates and classification** (planned start and end, Function, BU/GO, project category: Business Growth and Sustainability, Operational Efficiency, Governance Risk and Regulatory); **objective and priority**. TRM application links and the SAP / PA Tool project code were not chosen for now.
- **Statuses:** Draft → Business case → Approved → In delivery → Closing → Closed, plus On hold and Cancelled from any stage. The business case and closure approvals move the project forward.
- **Who is "in" a portfolio:** the portfolio lead, a workstream lead of one of its streams, or a product or project manager on one of its projects. There is no separate member list. PMO and system admins always see every portfolio.

2026-10-27 (round 3, business case routing):

- **Request types** (Project Request, Project Funding Request, Business Case) are **requests on the project**: one project record with a request attached at each stage, and the approval matrix picks approvers by request type.
- **Approval amount basis is the calculator's "Project Implementation Cost For This Request"** (implementation cost for years 1–3 less budget already approved for the project, in USD at the daily rate on the submission date). This **replaces the TCO basis** decided on 2026-10-21. The matrix limits are in USD; the MYR 400k-a-year BAU rule is still to be placed once the matrix retake arrives.
- **EA review is a separate step in the business case's own approval chain**, with its own reviewers; it does not use the SAD / ARB queue.
- **Function and BU/GO are free text for now.** The calculator's per-country settings (currency, tax rate, discount rate, exchange rate) are chosen on each business case rather than derived from the project.

2026-10-27 (round 4, business case financials and sections; built in a later slice, after structure + project):

- **The app calculates the business case financials itself** (costs, benefits, tax, NPV, IRR, payback, CAPEX/OPEX totals), tested cell for cell against Project Financial Calculator v1.7 with the sample project as the test case. Formulas to match: the tax row is `-SUM(cost rows) × tax rate` (a cost creates a positive tax shield), the net row is cost + annual benefit excluding VONB + tax + distributable earnings from ANP, `NPV(VONB incl) = NPV(rate, years 1–34 net) + implementation net`, IRR is "N/A" when the final net is not positive, and payback is the first month the running total turns positive, over 5 and 10 years.
- **Yearly per-country tables** (tax rate, discount rate, local currency, denomination, USD exchange rate, and the RMB to MYR rule for TSS costs) are **maintained by PMO or admins in a maintenance screen**, with the year and source recorded, so no release is needed when Finance publishes new figures.
- **VONB is included, with an Actuarial step**: additional ANP per year with Actuarial's distributable-earnings factors, entered or confirmed by Actuarial and signed off by the Local CFO.
- **The business case slice includes all four groups of sections:** summary and scope; costs (implementation cost by ZGOE type and year, count × rate breakdown with remarks and cost centre, pre/post BAU costs, AIA entities allocation); benefits and KPIs (with benefit dependencies); impact and risk (business impact assessment and risk register). Org chart and roles, dependencies and the change management plan follow later.

## Waiting on the product owner

- A retake of the approval matrix with its footnotes (² on PMO, ⁴ on FD & TOPD for business cases, and any ³); this also decides the reviewer roles and where the MYR 400k-a-year BAU rule applies.
- The approval limits behind "Follow Approval Limit" (CFO & CTO, CEO, Group).
- The 15-page "Digital Business Case Form Specification" (only the PowerPoint and the Excel calculator have been read so far).
- ~~The Excel financial calculator~~ received on 2026-10-27 (24 sheets; the file is named v1.9 (Y26) but its own version log ends at v1.7, so "v1.7" in this file means this workbook; confirm with its owners that nothing changed between v1.7 and v1.9). To confirm with its owners before matching it: the "NPV (VONB excl)" cell adds the implementation-year net (H77) instead of the implementation-year benefits-only value (H75), which looks like a slip but is what the workbook does today.

## Open questions

Recorded as they are asked; see the sections above once answered.
