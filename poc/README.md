# POC Scripts (ServiceNow Extraction)

This folder contains proof-of-concept extraction scripts that pull data from ServiceNow and write local artifacts used by TRM.

## 1) What Is Here

- `poc-snow-apm.js`
- extracts multiple APM-related tables
- writes the filtered JSON straight into the repository's `apm/` folder (the folder `npm run trm:sync -- --dir ../apm` loads)
- keeps the raw and clean variants in `d:\\TRM\\apm`, outside the repository

- `poc-snow-sw-lifecycle.js`
- extracts SW Lifecycle Installation Discovery table
- writes CSV output in this folder

- `vscode-extension/`
- local Node context used by scripts to resolve `playwright-core`

## 2) Why These Scripts Exist

These scripts were built to bootstrap data ingestion rapidly without implementing full OAuth/service-account integration.

They leverage an existing interactive browser login session to obtain authentication context, then call ServiceNow REST table APIs.

## 3) Prerequisites

- Node.js 18+ (20+ recommended)
- npm
- Microsoft Edge or Google Chrome installed
- Active login capability to target ServiceNow instance
- `playwright-core` installed for this folder context

Install dependency (from `poc`):

```bash
npm install
```

If needed, initialize local extension folder dependencies:

```bash
cd vscode-extension
npm init -y
npm install playwright-core
```

## 4) Authentication Approach

Both scripts:

1. open a persistent browser context (Edge/Chrome channel)
2. navigate to a ServiceNow page
3. wait for user-authenticated session
4. capture either:

- bearer token (if observed), or
- session cookies

5. attempt to capture ServiceNow CSRF token (`g_ck`)

Then scripts call ServiceNow REST endpoints using captured credentials.

## 5) Script: poc-snow-apm.js

### Source tables

- `cmdb_ci_business_app`
- `u_cmdb_qb_result_5e77ee7b1941f2839990ff5dfecbcf62c13012a8`
- `u_cmdb_qb_result_59dd095f6d3db3f887a927d6d33368b809ca111b`
- `cmdb_ci_business_capability`
- `cmdb_ci_service_discovered`
- `cmdb_ci_service`
- `u_ba_as_sm`
- `u_product_standard`

### Output

- raw JSON (every business unit): `d:\\TRM\\apm\\*.json` (outside the repository)
- clean JSON: `d:\\TRM\\apm\\clean\\*.json` (outside the repository)
- filtered JSON (AIA Malaysia rows): `../apm/*.json` (the repository's `apm/` folder, found from the script's own location)

### Filters

- Remove columns empty across all rows (clean stage)
- Filter rows by business-unit and capability parent rules (filtered stage)

### Run

```bash
node poc-snow-apm.js
```

## 6) Script: poc-snow-sw-lifecycle.js

### Source table

- `u_sw_lifecycle_installation_discovery`

### Output

- CSV file: `sw_lifecycle_installation_discovery.csv`

### Run

```bash
node poc-snow-sw-lifecycle.js
```

## 7) Operational Notes

- Scripts paginate through table APIs using limit/offset
- HTTP retries are built in for transient failures
- ServiceNow reference fields are flattened
- SSL certificate validation is disabled in requests (`rejectUnauthorized: false`), intended for controlled internal use only

## 8) Known Constraints

- Script behavior relies on local browser profile location conventions
- Requires interactive session to be valid at execution time
- Hardcoded target host and report URLs are environment-specific
- Raw and clean output paths assume Windows path `d:\\TRM\\apm` (the filtered output follows the repository location)

## 9) Safety and Security Guidance

- Do not commit session artifacts, cookies, or tokens
- Treat exported data as sensitive
- Prefer least-privilege accounts for extraction
- For production-grade pipelines, replace browser-session capture with service principal/integration auth

## 10) Troubleshooting

### No cookies/token captured

- Verify you are logged in to the target ServiceNow instance in Edge/Chrome
- Re-run and allow page to fully load during wait window

### playwright-core module cannot be found

- Ensure `playwright-core` is installed in expected script resolution path
- Confirm current working directory switching in script matches your local setup

### API request returns non-200

- Inspect printed response snippet
- Check table permissions and session validity
- Validate CSRF token capture (`g_ck`) availability

### Output not generated where expected

- Confirm local path `d:\\TRM\\apm` and the repository's `apm/` folder exist and are writable
- Review script logs for per-table failure messages

## 11) Relationship to Other Folders

- Dataset destination: `../apm`
- API consumer/importer: `../trm-api`
- UI consumer after import: `../trm-web`
