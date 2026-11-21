"use strict";

/**
 * POC: Extract APM-related CMDB tables from ServiceNow into JSON.
 * Tables:
 *   Business Application            - cmdb_ci_business_app
 *   BA-AS-SERVER                     - u_cmdb_qb_result_5e77ee7b1941f2839990ff5dfecbcf62c13012a8
 *   BA-AS-BS                         - u_cmdb_qb_result_59dd095f6d3db3f887a927d6d33368b809ca111b
 *   Business Capability              - cmdb_ci_business_capability
 *   Mapped Application Service       - cmdb_ci_service_discovered
 *   Business Service                 - cmdb_ci_service
 *   BA-AS-SM                         - u_ba_as_sm
 *   Product Standard                 - u_product_standard
 * Target: https://aiaprod.service-now.com
 *
 * Output:
 *   Raw records                -> d:\TRM\apm\<slug>.json            (every business unit; stays outside the repo)
 *   Empty-key-filtered records -> d:\TRM\apm\clean\<slug>.json      (stays outside the repo)
 *   Row-filtered records       -> <repo>\apm\<slug>.json            (what `npm run trm:sync -- --dir ../apm` loads)
 *     - business_capability: drops rows where name or parent starts with "AU_"
 *     - product_standard: no row filter (copied through as-is)
 *     - all other tables: keeps only rows where u_owned_business_unit === "AIA Malaysia";
 *       if a table has no u_owned_business_unit field at all, it is copied through unchanged
 *
 * Run: node poc-snow-apm.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Playwright session capture (cookies instead of Bearer token) ───────────────
async function captureSnowCookies(navigateTo, waitMs = 20000) {
  const { chromium } = require("playwright-core");

  const PROFILE_PATHS = [
    path.join(os.homedir(), "AppData/Local/Microsoft/Edge/User Data"),
    path.join(os.homedir(), "AppData/Local/Google/Chrome/User Data"),
  ];
  const userDataDir = PROFILE_PATHS.find((p) => fs.existsSync(p));
  if (!userDataDir) throw new Error("Could not find Edge or Chrome profile.");

  const isEdge = userDataDir.includes("Edge");

  // Copy minimal session files to a temp dir
  const tempDir = path.join(os.tmpdir(), "pw-snow-poc-apm");
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const defaultSrc = path.join(userDataDir, "Default");
  const defaultDst = path.join(tempDir, "Default");
  if (fs.existsSync(defaultSrc)) {
    fs.mkdirSync(defaultDst, { recursive: true });
    for (const name of ["Cookies", "Login Data", "Web Data"]) {
      const src = path.join(defaultSrc, name);
      if (fs.existsSync(src))
        try {
          fs.copyFileSync(src, path.join(defaultDst, name));
        } catch {}
    }
    const netSrc = path.join(defaultSrc, "Network");
    if (fs.existsSync(netSrc)) {
      const netDst = path.join(defaultDst, "Network");
      fs.mkdirSync(netDst, { recursive: true });
      for (const f of fs.readdirSync(netSrc)) {
        try {
          fs.copyFileSync(path.join(netSrc, f), path.join(netDst, f));
        } catch {}
      }
    }
  }

  const context = await chromium.launchPersistentContext(tempDir, {
    headless: false,
    ignoreHTTPSErrors: true,
    channel: isEdge ? "msedge" : "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = await context.newPage();

  // Also try to grab a Bearer token if ServiceNow sends one
  let bearerToken = null;
  page.on("request", (req) => {
    if (bearerToken) return;
    const auth = req.headers()["authorization"];
    if (
      auth?.startsWith("Bearer ") &&
      req.url().includes("aiaprod.service-now.com")
    ) {
      bearerToken = auth.slice(7);
    }
  });

  try {
    await page.goto(navigateTo, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  } catch {}

  console.log(
    `   Waiting ${waitMs / 1000}s for page to fully load and authenticate…`,
  );
  await page.waitForTimeout(waitMs);

  // Grab all cookies for the ServiceNow domain
  const cookies = await context.cookies("https://aiaprod.service-now.com");

  // Extract ServiceNow CSRF token (g_ck) from the page — required by REST API
  let gck = null;
  try {
    gck = await page.evaluate(() => {
      // g_ck is a global var set by ServiceNow on every page
      if (typeof g_ck !== "undefined") return g_ck;
      // fallback: search page source
      const m = document.documentElement.innerHTML.match(
        /g_ck\s*=\s*['"]([a-f0-9]+)['"]/,
      );
      return m ? m[1] : null;
    });
  } catch {}
  if (gck)
    console.log(`   CSRF token (g_ck) captured: ${gck.substring(0, 12)}…`);
  else console.log("   CSRF token (g_ck) not found — will try without it.");

  await context.close();
  try {
    fs.rmSync(tempDir, { recursive: true });
  } catch {}

  if (!cookies.length && !bearerToken) {
    throw new Error(
      "No cookies or token captured. Ensure you are logged into ServiceNow via Edge or Chrome.",
    );
  }

  // Build Cookie header string
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return { cookieHeader, bearerToken, gck };
}

// ── HTTP helper for ServiceNow REST API ───────────────────────────────────────
function snowGetOnce(cookieHeader, bearerToken, gck, apiPath) {
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (bearerToken) {
      headers["Authorization"] = `Bearer ${bearerToken}`;
    } else {
      headers["Cookie"] = cookieHeader;
    }
    if (gck) headers["X-UserToken"] = gck;

    const req = https.request(
      {
        hostname: "aiaprod.service-now.com",
        path: apiPath,
        method: "GET",
        rejectUnauthorized: false,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString()),
              headers: res.headers,
            });
          } catch {
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString(),
              headers: res.headers,
            });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function snowGet(cookieHeader, bearerToken, gck, apiPath, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await snowGetOnce(cookieHeader, bearerToken, gck, apiPath);
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = attempt * 3000;
      process.stdout.write(
        ` [${err.code || err.message} — retry ${attempt}/${retries - 1} in ${wait / 1000}s] `,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ── Flatten a ServiceNow record (unwrap display_value objects) ─────────────────
function flattenRecord(rec) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v && typeof v === "object" && "value" in v) {
      out[k] = v.value ?? "";
      if (v.display_value && v.display_value !== v.value) {
        out[`${k}_display`] = v.display_value;
      }
    } else {
      out[k] = v ?? "";
    }
  }
  return out;
}

// ── Fetch every record of a table, paginated ────────────────────────────────────
async function fetchAllRecords(
  cookieHeader,
  bearerToken,
  gck,
  table,
  pageSize,
) {
  const allRecords = [];
  let offset = 0;
  let page = 0;

  while (true) {
    page++;
    const apiPath =
      `/api/now/table/${table}` +
      `?sysparm_display_value=true` +
      `&sysparm_limit=${pageSize}` +
      `&sysparm_offset=${offset}` +
      `&sysparm_exclude_reference_link=true`;

    process.stdout.write(`   Page ${page} (offset ${offset})… `);
    const res = await snowGet(cookieHeader, bearerToken, gck, apiPath);

    if (res.status !== 200) {
      console.error(`\n   ❌ API call failed: HTTP ${res.status}`);
      console.error(JSON.stringify(res.body, null, 2).substring(0, 600));
      throw new Error(`HTTP ${res.status} fetching ${table}`);
    }

    const records = res.body.result ?? [];
    console.log(`${records.length} records`);

    if (!records.length) break;

    allRecords.push(...records.map(flattenRecord));
    offset += records.length;

    const total = parseInt(res.headers["x-total-count"] ?? "0", 10);
    if (total && offset >= total) break;
    if (records.length < pageSize) break;
  }

  return allRecords;
}

// ── Drop keys that have no value across the *entire* record set ────────────────
function isEmptyValue(v) {
  return (
    v === null || v === undefined || (typeof v === "string" && v.trim() === "")
  );
}

function dropEmptyKeys(records) {
  if (!records.length) return { records, droppedKeys: [] };

  const allKeys = new Set();
  for (const r of records) for (const k of Object.keys(r)) allKeys.add(k);

  const droppedKeys = [...allKeys].filter((k) =>
    records.every((r) => isEmptyValue(r[k])),
  );
  const droppedSet = new Set(droppedKeys);

  const cleaned = records.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      if (!droppedSet.has(k)) out[k] = v;
    }
    return out;
  });

  return { records: cleaned, droppedKeys };
}

// ── Row-level filters applied on top of the cleaned records ────────────────────
function filterRecords(slug, records) {
  if (slug === "product_standard") {
    return records;
  }

  if (slug === "business_capability") {
    const isAu = (value) => typeof value === "string" && value.startsWith("AU_");
    return records.filter((r) => !isAu(r.name) && !isAu(r.parent));
  }

  // All other tables: keep only rows for "AIA Malaysia". If the table has no
  // u_owned_business_unit field at all, leave the records untouched.
  const hasField = records.some((r) =>
    Object.prototype.hasOwnProperty.call(r, "u_owned_business_unit"),
  );
  if (!hasField) return records;

  return records.filter((r) => r.u_owned_business_unit === "AIA Malaysia");
}

// ── JSON helper ──────────────────────────────────────────────────────────────
function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ── Tables to extract ──────────────────────────────────────────────────────────
const TABLES = [
  {
    label: "Business Application",
    table: "cmdb_ci_business_app",
    slug: "business_application",
  },
  {
    label: "BA-AS-SERVER",
    table: "u_cmdb_qb_result_5e77ee7b1941f2839990ff5dfecbcf62c13012a8",
    slug: "ba_as_server",
  },
  {
    label: "BA-AS-BS",
    table: "u_cmdb_qb_result_59dd095f6d3db3f887a927d6d33368b809ca111b",
    slug: "ba_as_bs",
  },
  {
    label: "Business Capability",
    table: "cmdb_ci_business_capability",
    slug: "business_capability",
  },
  {
    label: "Mapped Application Service",
    table: "cmdb_ci_service_discovered",
    slug: "mapped_application_service",
  },
  {
    label: "Business Service",
    table: "cmdb_ci_service",
    slug: "business_service",
  },
  { label: "BA-AS-SM", table: "u_ba_as_sm", slug: "ba_as_sm" },
  {
    label: "Product Standard",
    table: "u_product_standard",
    slug: "product_standard",
  },
];

const PAGE_SIZE = 1000; // records per API call (max 10000)
const WORK_DIR = "d:\\TRM\\apm";
const CLEAN_DIR = path.join(WORK_DIR, "clean");
const FILTERED_DIR = path.resolve(__dirname, "..", "apm");

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Change cwd so playwright-core resolves from the extension's node_modules
  process.chdir(path.join(__dirname, "vscode-extension"));

  const SNOW_URL =
    "https://aiaprod.service-now.com/now/nav/ui/classic/params/target/" +
    "sys_report_template.do%3Fjvar_report_id%3Dd2eed0a62bc04790e32ef4b9f291bf59";

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.mkdirSync(CLEAN_DIR, { recursive: true });
  fs.mkdirSync(FILTERED_DIR, { recursive: true });

  // ── Step 1: Capture session ──────────────────────────────────────────────
  console.log("Step 1: Opening browser to capture ServiceNow session…");
  const { cookieHeader, bearerToken, gck } = await captureSnowCookies(
    SNOW_URL,
    30000,
  );
  if (bearerToken) {
    console.log("✅ Bearer token captured.\n");
  } else {
    console.log(
      `✅ Session cookies captured (${cookieHeader.split(";").length} cookies).\n`,
    );
  }

  // ── Step 2: Fetch each table, save raw + cleaned JSON ───────────────────
  const summary = [];

  for (const { label, table, slug } of TABLES) {
    console.log(`=== ${label} (${table}) ===`);

    let records;
    try {
      records = await fetchAllRecords(
        cookieHeader,
        bearerToken,
        gck,
        table,
        PAGE_SIZE,
      );
    } catch (err) {
      console.error(`   ⚠️  Skipping ${label}: ${err.message}\n`);
      summary.push({
        label,
        table,
        status: "failed",
        error: err.message,
      });
      continue;
    }

    const rawPath = path.join(WORK_DIR, `${slug}.json`);
    writeJson(rawPath, records);
    console.log(`   Raw saved:   ${rawPath} (${records.length} records)`);

    const { records: cleaned, droppedKeys } = dropEmptyKeys(records);
    const cleanPath = path.join(CLEAN_DIR, `${slug}.json`);
    writeJson(cleanPath, cleaned);
    console.log(
      `   Clean saved: ${cleanPath} (dropped ${droppedKeys.length} always-empty key(s)${droppedKeys.length ? ": " + droppedKeys.join(", ") : ""})`,
    );

    const filtered = filterRecords(slug, cleaned);
    const filteredPath = path.join(FILTERED_DIR, `${slug}.json`);
    writeJson(filteredPath, filtered);
    console.log(
      `   Filtered saved: ${filteredPath} (${filtered.length} of ${cleaned.length} records kept)\n`,
    );

    summary.push({
      label,
      table,
      status: "ok",
      records: records.length,
      droppedKeys: droppedKeys.length,
      filtered: filtered.length,
    });
  }

  // ── Step 3: Print summary ────────────────────────────────────────────────
  console.log("=== Summary ===");
  for (const s of summary) {
    if (s.status === "ok") {
      console.log(
        `✅ ${s.label}: ${s.records} records, ${s.droppedKeys} empty key(s) dropped, ${s.filtered} kept after row filter`,
      );
    } else {
      console.log(`❌ ${s.label}: ${s.error}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});
