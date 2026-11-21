# SAD review, 2026-10-25

Scope: the whole SAD module (Part 1 and Part 2 phases 1–8), API and web app, checked against [modules/sad.md](../modules/sad.md) and [requirements-decisions.md](../requirements-decisions.md). Method: four independent reviewers (backend core, diagram rules, web app, PDF/uploads/compare) read the code and tests against the spec. Every finding below was then checked again against the code; findings marked **reproduced** were also run against the real domain functions. Nothing was changed: fixes wait for the product owner's go-ahead.

## Gates (all green on 2026-10-25)

| Check | Result |
|---|---|
| API lint, types, entities vs migrations | clean; "Entities match the migration snapshot" |
| API tests (unit, integration, e2e) and coverage | 943 tests passed; coverage gate met (lines 99.84%, branches 99.18%, functions 99.60%) |
| Web app lint, types, build | clean |
| Web app tests and coverage | 924 tests passed; coverage gate met (lines 99.72%, branches 99.39%, functions 99.42%) |
| Playwright (desktop, tablet, phone, with accessibility scans) | 168 runs passed |

Green gates and high coverage did not catch the problems below: most are paths the tests never take (split roles, portfolio scopes, failures part-way, other sections).

## Findings

Severity: **High** = security hole, data loss or a flow that gets stuck; **Medium** = wrong behaviour or a spec decision not met; **Low** = edge case, wording, hardening. Source ids (A–D) are the reviewers' own.

### High

| # | Finding | Spec | Where | Status |
|---|---|---|---|---|
| SAD-01 | **Approvers held at portfolio level are lost after step 1, so a SAD gets stuck in approval.** The SAD passes the application's portfolios as a list; the approval instance stores only a single `portfolioId` (always empty for SADs), so step 2 (Solution architect) is resolved without the portfolios. If the only solution architect is assigned on the application's portfolio, the application manager's approval fails with "No approver could be found". Submit's own check passes (it uses the full scope). Also affects escalation and "act for submitters" at portfolio scope. (A1) | Versions and approval; Access ("application or portfolio scope") | `approvals/approval.service.ts:79-86` (`scopeOf`), `:288`, `:388`; `sad/sad-trm.ts:86` | verified in code |
| SAD-02 | **Renaming a diagram's id bypasses "each view edits its own part".** Nothing fixes the ids of the solution diagram or the Production/Non-production tabs. A section 3 editor who sends the Production tab under a new id deletes every integration connection (section 2's) and the API sees only an infrastructure change; a section 2 editor renaming the solution diagram erases section 9's data flow facts. Files under the old id are pruned too. (B1) | Solution diagram views; Who sees and edits what | `domain/diagrams.ts:235-251` (no id rule), `:339-358`, `:374-387` | **reproduced** |
| SAD-03 | **Hidden lines and facts are put back by id, so with split roles they land on the wrong items.** The web app numbers new items from the ids it can see. (a) A section 3 editor who cannot read section 2 adds a line that takes a hidden integration connection's id: the slot is stored with two `line-2` and every later save by someone who sees both fails validation. (b) A section 2 editor without section 9 removes a connection and draws a new one: the new one inherits the old one's data objects and classification. (c) The same moves integration connections onto a new box that reuses a removed box's id. (d) Copy from production by a section 3 editor without section 2 read keeps Non-production's old integration connections and does not copy Production's. (B2, D4) | Solution diagram views ("hiding never erases or changes them"); Copy from production | `domain/diagrams.ts:339-358`; `sad.service.ts:615-628` (validated before restoring, not after); web `diagrams/model.ts:49-52`, `diagrams/infrastructure.ts:124-133` | **reproduced** (a, b) |
| SAD-04 | **Production can run without malware scanning.** `STORAGE_DRIVER` defaults to `local` and the production checks do not require `azure-blob`. A deployment that forgets the setting stores files on the App Service disk as "unscanned", and unscanned files download at once. (D1) | Uploads: held until Defender reports clean | `config/env.ts:56`, `:94-104` | verified in code |
| SAD-05 | **One storage error stops every malware check.** `checkScans` has no per-file error handling and deletes a malicious blob before saving its status. A transient Azure error, or a blob deleted outside the app (e.g. Defender's own auto-delete), makes every later run fail: held files stay held for ever and nobody is notified. (D2) | Uploads: malicious blocked, deleted, people told | `sad-uploads.service.ts:146-162`; `storage/file-storage.ts:102` | verified in code |
| SAD-06 | **An imported draw.io diagram removed before saving blocks every save.** The pending import keeps its diagram ids; after the diagram is removed (or the slot is set to Not applicable, or re-imported over), saving the slot works, then keeping the file gets 409 and the section's answers are never saved. Every Save repeats it until the page is reloaded and the edits are lost. (D3, C2) | draw.io import: "nothing is kept if the import is not saved" | web `SadEditorPage.tsx:118-133`, `DiagramSlotEditor.tsx:123-127`, `:238-241` | verified in code |
| SAD-07 | **Section 4 lets section 3 editors draw the infrastructure diagram.** The spec says section 4 shows it read-only; the editor gives full drawing tools there (Not applicable, hosting, Copy from production, import, files, add and remove) to anyone who edits section 3, and hides the "Drawn in" note. Not covered by tests (the test template's section 4 has no diagram). (C1) | The diagrams: "Section 4 … read-only" | web `diagrams/GroupDiagrams.tsx:59` | verified in code |

### Medium

| # | Finding | Spec | Where | Status |
|---|---|---|---|---|
| SAD-08 | **"Copy from production" excuse lets a section 3 editor remove Non-production integration connections.** Any Non-production change is accepted when its integration connections equal Production's, without checking the rest is a copy. With section 2 read (but not edit), deleting them when Production has none is accepted. (B3) | Copy from production (section 3) vs integration (section 2) | `domain/diagrams.ts:380` | **reproduced** |
| SAD-09 | **Submit records the submitter before the approval engine accepts.** (a) A different editor resubmitting a returned draft is refused, but the version now names them as submitter (screen and PDF). (b) With no published rule, submit fails after marking the version submitted. (c) Suspected: two submits at once can both pass (nothing stops two active approvals per SAD); the "approved" event is not checked against the version's own approval. (A2) | Versions and approval | `sad.service.ts:667-696`, `:738-747` | verified in code (c suspected) |
| SAD-10 | **Version Control rows are wrong after a return.** Built from each task's final status: a returned task that is reviewed again prints "superseded", an answered question prints "pending", one "Submitted" row only (latest time, out of order), no "Resubmitted", rounds of a cancelled approval disappear. (A3) | Version control table | `sad.service.ts:336-356`; engine `domain/engine.ts:237`, `:255` | verified in code |
| SAD-11 | **Only section 2 editors can search TRM, but sections 3 and 12 (and the draw.io review) need it.** A section 12 or section 3 editor without section 2 edit gets 403; the picker shows any failure as "No TRM application matches". (B4, C6) | Monitoring "Other system … picked from TRM"; infrastructure other applications | `sad.controllers.ts:122`, `sad.service.ts:503`; web `diagrams/solution.tsx:18-37` | verified in code |
| SAD-12 | **Section 2 editors adding a box into a zone are refused.** The Integration view refits zone sizes after each change; zone sizes are section 3's part, so a section-2-only editor's save is refused with "You cannot change the zones, boxes and infrastructure lines". (C5) | Who sees and edits what (section 2 places other applications and external parties) | web `diagrams/InfrastructurePane.tsx:356`; `domain/diagrams.ts:364-368` | likely (to prove with a test) |
| SAD-13 | **Leaving the editor drops unsaved changes without asking**, except through the section list: back link, "Review and submit", side navigation, browser Back/Forward, closing the tab. (C3) | Decided while building part 1: asks before leaving | web `SadEditorPage.tsx:259-284` | verified in code |
| SAD-14 | **Approvers cannot see the backup schedule's details**, and retired rows disappear. Rows hold only the standard's id; the list needs a backup permission, so approvers see blanks. Retired rows are not sent to authors (older versions show "—"; a ticked retired row cannot be unticked) but are offered to maintainers for ticking. (A6, C7, C8) | Approvers see every section; backup schedule | `sad.controllers.ts:206`, `sad-retention.service.ts:36`; web `RetentionField.tsx:25`, `AnswerView.tsx:170` | verified in code |
| SAD-15 | **TRM values cross sections.** A reader of only Environment Details gets the Application Details TRM values (BIA, RPO/RTO, classification, portfolios), and the other way round. Seeded roles hold both, but roles are configurable. (A4) | Access: only granted sections | `sad.service.ts:324` | verified in code |
| SAD-16 | **People and applications in answers are not checked.** Person and application cells accept any id with any name the browser sends; the central API inventory shows those names. Diagram picks, by contrast, are checked against TRM. (A7) | API inventory (owner, dependencies) | `domain/answers.ts:8`, `:41-43` | verified in code |
| SAD-17 | **Zones sized "By hand" can only be resized by dragging** (no width/height fields): no keyboard way, against the spec's "tables are also the keyboard way" and WCAG 2.2 (2.1.1, 2.5.7). (C11) | Every diagram slot: Editing | web `DiagramCanvas.tsx:54`, `diagrams/parts.tsx` | verified in code |
| SAD-18 | **A failed diagrams load shows nothing**: no loading state, no error, no retry, on the version and editor pages; a failed retention load leaves the schedule empty. (C12) | ui-screen states | web `SadVersionPage.tsx:31`, `SadEditorPage.tsx:239`, `GroupDiagrams.tsx:50-51` | verified in code |
| SAD-19 | **The API list for integration connections is stale after saving the API inventory** (until reload), so new APIs are missing and removed ones are offered and then refused. (C4) | Integration view: API link | web `queries.ts:90-106` | verified in code |

### Low

| # | Finding | Where |
|---|---|---|
| SAD-20 | Compare shows "sad.diagram.zoneKinds.This application" for grouping boxes' kinds (missing default text). (D7) | web `diagrams/DiagramChanges.tsx:105` |
| SAD-21 | Files can be added to a slot's default diagrams before it was ever saved (spec: "must have been saved"). (D5) | `sad.service.ts:485-491` |
| SAD-22 | Deleting a stored file runs after the commit without error handling: the API answers 500 although the save worked, and the file is orphaned. (D8) | `sad.service.ts:644`, `sad-uploads.service.ts:124` |
| SAD-23 | Every Integration-view reader (incl. read-only and vendors) gets every API inventory name, not only linked ones (spec: "a linked API's name"). (B7) | `sad.service.ts:470-472` |
| SAD-24 | Infrastructure rows saved before hosting settings existed refuse section 2 saves until section 3 saves once (dev data only so far). (B8) | `sad.service.ts:467`, `:624-625` |
| SAD-25 | No warning when the API session timeout is over 15 minutes without a refresh token (only a hint). (A8, C10) | `domain/template.ts:336-339` |
| SAD-26 | A conflicting save says "someone else changed this section" but does not return the latest content. (A11) | `sad.service.ts:409`, `:623` |
| SAD-27 | In section 2, removing a shared box drops its integration connections without asking. (C13) | web `InfrastructurePane.tsx:227` |
| SAD-28 | Removing a VNet or subnet moves its contents to the parent, where the placement rules refuse them; the editor does not warn, the save fails. (C14) | web `diagrams/model.ts:235-246` |
| SAD-29 | An approver without TRM or section 2 role sees a permanent "load failed" box for "Calls from other applications", and a back link they cannot open. (C15) | web `GroupDiagrams.tsx:71`, `SadVersionPage.tsx:42` |
| SAD-30 | A hidden "Does not apply" with an empty reason blocks saving with an invisible message. (C16) | web `SadEditorPage.tsx:95-100` |
| SAD-31 | Save is not busy while a draw.io file uploads: a second click may store it twice (suspected). (C17) | web `SadEditorPage.tsx:226` |
| SAD-32 | The API inventory page has no application filter (spec lists it; the API supports it). (C9) | web `ApiInventoryPage.tsx` |
| SAD-33 | Wording and edge rights: the separation-of-duties case says "No application manager is assigned" when the only one is the submitter; `sad:draft:manage` alone is unusable; a starter who loses edit rights cannot cancel their draft; if making a version current fails, it stays "in approval" for good. (A12) | `sad.service.ts:676-677`, `:182`; `sad.controllers.ts:171`; `approval.service.ts:323` |
| SAD-34 | Hardening: macros detected only by the literal part name `vbaProject.bin` (Defender remains the main control); pdfmake's file rule is a prefix check without normalising paths (not reachable today); upload add/remove check the diagram outside the version lock; the compare page does not check both versions are the same application; any grouping box typed "This application" counts as the application in the calls mapping; the calls endpoint reads every approved SAD on each request. (D9, D10, D12, D13, B9) | various |
| SAD-35 | Accessibility and wording: retention rows' fields are all named "Resource name"/"Comment"; a hand-made radio group (`Segmented`) has no arrow keys; hidden names show "—" instead of "Restricted" in table person columns and the API inventory. (C18, C19) | web `RetentionField.tsx:42-49`, `diagrams/parts.tsx:64-84`, `AnswerView.tsx:159`, `ApiInventoryPage.tsx:90` |
| SAD-36 | The spec's per-section completion bar is a count ("3 to answer") without a bar. (C19) | web `SectionNav.tsx:47-55` |
| SAD-37 | Found while fixing SAD-09: the Approval Centre's Resubmit (`POST /approval-instances/{id}/resubmit`) sends a returned SAD back into approval without the SAD's checks (completeness, fresh TRM and backup snapshots, submitter and date). Decided: the same checks there. | `approvals/approval.service.ts` (`resubmit`), `sad.service.ts` (`submit`) |

## Test gaps

- **Not tested at all**: approval with a portfolio-scoped approver (SAD-01); renamed diagram ids and split-role saves (SAD-02, SAD-03, SAD-08); a production config without Azure storage (SAD-04); a storage error during the malware check (SAD-05); removing an imported diagram before saving (SAD-06); section 4 (SAD-07); a refused resubmit leaving the version unchanged (SAD-09); the Version Control rows themselves (SAD-10); a non-section-2 editor searching TRM (SAD-11); TRM values for a single-section reader (SAD-15); unknown people or applications in answers (SAD-16); failed diagram, retention or TRM search loads (SAD-18).
- **Only positive cases**: draft copies the current version; numbering; TRM snapshot at submit; cancel draft (no 403/409 case in the web app, no wrong-scope `sad:draft:manage` case in the API); the "No solution architect" refusal (only the application manager one is tested); audit records other than `sad.section.saved` and `sad.version.approved`; Copy from production at API level; a vendor holding a diagram edit role; the nine conditional rules of the real template one by one; retention list refused to vendors and invalid retention bodies (400).
- **Uploads and PDF**: names shown as "Restricted" in the PDF (uploader, Version Control) for a reader without name access; the download audit row; a file over 25 MB refused at API level (413); upload to a draft in approval; pruning a carried file still used by the approved version.
- **Web app routes**: no forbidden-route tests for `/sad`, `/sad/apis`, `/sad/versions/:id`, `/sad/versions/:id/edit`; no 403 test for starting a draft.
- **Playwright**: phase 8a (diagrams in the PDF) has no journey, although each phase should have one; no section 4 or forbidden-route journeys.

## Documentation gaps

- `requirements-decisions.md` build-status table has no entry for SAD part 2 (diagrams, phases 1–8).
- `requirements-decisions.md` §16 still lists "SAD export to Word/PDF" as open: PDF is built, Word is not.

## Fix status (2026-10-25)

Every finding is fixed, test-first, each with positive and negative tests. The test gaps above are covered too (API e2e, web tests and Playwright journeys: the PDF download, section 4 read-only, forbidden routes).

| Findings | Fixed in |
|---|---|
| SAD-01 | `646df74` Approvals keep every portfolio of the record |
| SAD-02, 03, 08, 11, 12, 23, 24, 27 (hidden facts), 34 (one "This application") | `788f325` Diagram saves keep every section's part |
| SAD-04, 05, 21, 22, 34 (macros, PDF file rule, upload lock) | `b29223e` Uploads: never unscanned in production, sturdy scan and deletes |
| SAD-06, 07, 13, 17, 18, 19, 20, 28, 29, 30, 31, 32, 35, 36 | `15417e2` Screens: guarded leaving, load states, keyboard sizes |
| SAD-09, 10, 14, 15, 16, 25, 26, 33, 34 (calls endpoint), A5, A10 | `2fe2b14` Core: atomic submit, Version Control history, frozen retention |
| SAD-37 (found while fixing SAD-09) | `4618b5f` Resubmit in the Approval Centre runs the SAD's checks |
| A9 and the template decisions (template version 3, rich text, local authentication) | `58b1e1a` |
| API inventory rows (URLs per environment, typed owners, data objects) | `a07ab73` |
| SAD-27 (integration view), SAD-34 (compare across two applications), remaining test gaps | `cdbfd3c` Test gaps, last fixes, review status and docs |

## Decisions taken (product owner, 2026-10-25)

All recorded in [modules/sad.md](../modules/sad.md) ("Decided in the review" and the confirmed proposals).

| Topic | Decision |
|---|---|
| What to fix | Everything in this review, High first, test-first, one commit per group |
| Hidden facts on removal (B6, SAD-27) | Warn the editor, without showing the facts, and ask first |
| Re-pick from TRM (B5) | Re-picking the same application takes TRM's current name and number |
| Cancelled draft's files (D6) | Deleted on cancel (files other versions use are kept) |
| Removed questions (A10) | Approved and superseded versions show their answers, marked "No longer asked" |
| Unreadable sections (A5) | No counts and no hidden-question list for them |
| Answer types (A9) | Follow the spec: "Other (specify)" on every choice; the 9 one-line answers become rich text |
| Retention values (A6) | Frozen with the version at submit |
| Version Control (A3) | Also shown on the version page |
| Word export | Not wanted: PDF only |
| Vendors searching TRM | Kept as the spec says |
| Proposals | Settled one by one: API Inventory placement, URLs table, units, scan statuses, role table, TRM snapshot at submit, dependencies, approved-only inventory, cancel rights, `sadSecurity` removed, screens, PDF notes, template in code confirmed; the Application Details mapping stays open until a real ServiceNow export; an admin editor for questions is kept in view |
| Rich text | Adds headings (two levels), underline, strikethrough, font size (Small/Normal/Large) and tables |
| Show/hide rules | Password settings asked for every application; "SailPoint integration (ICFR)" replaced by "Identity and access management integration" (SailPoint, Okta, ForgeRock, Active Directory + Other) for every application; **local authentication** (method Local custom or Other) flags the application and needs a justification before submit; the flag shows on the SAD pages, section 8, the SAD list (filter), the TRM application page and the PDF (approved version's answer, else the draft's) |
| Privileged accounts | Adds Environment and Managed in CyberArk columns |
| API inventory rows | One row per API, with Production, UAT and DEV URLs (at least one); owners picked or typed (typed names hidden like picked ones); "Data connected" as rows of data object + key attributes |
| Repeated template questions | Each asked once: session timeout with the password settings, deployment question in Deployment Architecture; the PDF prints both template places |
| Old answers | No real SADs yet: no conversion; old answers stay in history |
| Resubmit in the Approval Centre (SAD-37) | Runs the SAD's own Submit checks |
| Local authentication flag on the list and TRM page | Section 5 readers only |
| API URL / endpoint column | Removed: the Production, UAT and DEV URLs replace it |
| "Other (specify)" scope | Choice and multiple-choice questions only (not table columns, not the TRM fallback) |

## Checked and found correct

Each line: the decision, where it is enforced, and whether tests cover both allowed and refused cases.

| Area | Decision | Tests |
|---|---|---|
| Drafts | One open draft per application (lock + unique index); start from the current version or empty | positive + negative |
| Saving | Per-section save with row version, read-only unless draft; 409 and 400 shown in the editor | positive + negative |
| Access | Per-section View/Edit within application/portfolio scope, Edit implies View, vendors by role | positive + negative |
| Access | Approvers see every section from their step, keep it after acting, cannot edit | positive + negative |
| Access | Every SAD route declares an access rule; unknown or out-of-scope versions give 404 | positive + negative |
| Answers | Validation per type; rich text stored as a document tree, never HTML; safe links only | positive + negative |
| Answers | Show/hide chains, Not applicable with a reason, completeness before submit (API and web app agree) | positive + negative |
| Approval | Submit needs completeness and an application manager; resubmit by the submitter only, resuming at the returning step | positive + negative |
| Names | Names follow field classes and the role; hidden names kept on save | positive + negative |
| API inventory | Central list: approved only, scoped, owners masked | positive + negative |
| Retention | Maintained by system admins with row versions | positive + negative |
| Diagrams | Zone placement table, fixed zones, one each of Internet / Azure global / 3rd party | positive + negative |
| Diagrams | Primary and DR differ; 58 Azure regions; 639 Azure icons | positive + negative |
| Diagrams | TLS 1.1/1.0 flagged, not blocking; integration facts required; API link only for the API pattern and in the inventory | positive + negative |
| Diagrams | Data flow facts required once data objects exist; approvals name who approves; every step in a lane | positive + negative |
| Diagrams | Each view edits its own part and readers never get other views' facts (for normal requests; see SAD-02/03/08) | positive + negative |
| Diagrams | TRM picks keep name and number; the SAD's own application refused; servers only the application's own | positive + negative |
| Diagrams | Submit counts each view in its editing section; both infrastructure tabs need a box | positive + negative |
| Mapping | What counts as a call, direction, "Restricted" per source SAD, 404 unless the reader sees the application | positive + negative |
| Web app | Copy from production asks first; servers become typed; hosting "Changed for this diagram" and back | positive + negative |
| Web app | Removal asks for data flow facts, lanes with steps, diagrams with files, Not applicable with files | positive + negative |
| Web app | draw.io review: "Choose" until a kind or Skip, confirm before replacing, lanes, DOCTYPE refused, labels parsed inert | positive + negative |
| Web app | Contract tests cover every SAD schema; no hex colours; all text through i18n | n/a |
| Uploads | Formats by extension and content; SVG, ZIP and old Office refused; 25 MB; 20 per diagram under the version lock | positive + negative |
| Uploads | Owning-section editors add/remove on drafts; readers of any showing section see; uploader name hidden without name access | positive + negative |
| Uploads | Held / failed / malicious; malicious deleted and people told; downloads as attachments with safe file names | positive + negative |
| Uploads | Carried into drafts as the same stored file; removing from a draft keeps the approved one; managed identity, no keys | positive + negative |
| PDF | Left-out sections listed, draft watermark, each diagram on its own landscape page, scaled to fit, renamed zones, files with "Restricted" | positive + negative |
| PDF | Only what the reader may see (e2e: a section-2-only vendor gets no data flow facts and no monitoring diagram) | positive + negative |
| Compare | Sections both versions show; changed diagrams only; content only; each view's own lines; files; one row per lone diagram | positive + negative |
