"use strict";

/**
 * POC: Extract all SW Lifecycle - Installation - Discovery records into CSV.
 * Table : u_sw_lifecycle_installation_discovery
 * Target: https://aiaprod.service-now.com
 *
 * Run: node poc-snow-sw-lifecycle.js
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
  const tempDir = path.join(os.tmpdir(), "pw-snow-poc");
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

// ── CSV helpers ───────────────────────────────────────────────────────────────
function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(filePath, records) {
  if (!records.length) {
    fs.writeFileSync(filePath, "No records found\n", "utf8");
    return;
  }
  const keys = Object.keys(records[0]);
  const lines = [keys.join(",")];
  for (const row of records) {
    lines.push(keys.map((k) => csvEscape(row[k])).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Change cwd so playwright-core resolves from the extension's node_modules
  process.chdir(path.join(__dirname, "vscode-extension"));

  const SNOW_URL =
    "https://aiaprod.service-now.com/now/nav/ui/classic/params/target/" +
    "sys_report_template.do%3Fjvar_report_id%3Dd2eed0a62bc04790e32ef4b9f291bf59";

  const TABLE = "u_sw_lifecycle_installation_discovery";
  const PAGE_SIZE = 1000; // records per API call (max 10000)
  const OUTPUT = path.join(
    __dirname,
    "sw_lifecycle_installation_discovery.csv",
  );

  // ── Step 1: Capture session ──────────────────────────────────────────────
  console.log("Step 1: Opening browser to capture ServiceNow session…");
  const { cookieHeader, bearerToken, gck } = await captureSnowCookies(
    SNOW_URL,
    20000,
  );
  if (bearerToken) {
    console.log("✅ Bearer token captured.\n");
  } else {
    console.log(
      `✅ Session cookies captured (${cookieHeader.split(";").length} cookies).\n`,
    );
  }

  // ── Step 2: Discover columns via schema API ──────────────────────────────
  console.log(`Step 2: Fetching table schema for ${TABLE}…`);
  const schemaRes = await snowGet(
    cookieHeader,
    bearerToken,
    gck,
    `/api/now/table/${TABLE}?sysparm_limit=1&sysparm_display_value=all`,
  );

  if (schemaRes.status !== 200) {
    console.error(`❌ Schema fetch failed: HTTP ${schemaRes.status}`);
    console.error(JSON.stringify(schemaRes.body, null, 2).substring(0, 600));
    process.exit(1);
  }

  const sampleRecords = schemaRes.body.result ?? [];
  const knownFields = sampleRecords.length
    ? Object.keys(sampleRecords[0]).join(", ")
    : "(no sample record)";
  console.log(`   Fields in sample: ${knownFields}\n`);

  // ── Step 3: Paginate and fetch all records ───────────────────────────────
  console.log(`Step 3: Fetching all records from ${TABLE}…`);
  const allRecords = [];
  let offset = 0;
  let page = 0;

  while (true) {
    page++;
    const apiPath =
      `/api/now/table/${TABLE}` +
      `?sysparm_display_value=true` +
      `&sysparm_limit=${PAGE_SIZE}` +
      `&sysparm_offset=${offset}` +
      `&sysparm_exclude_reference_link=true`;

    process.stdout.write(`   Page ${page} (offset ${offset})… `);
    const res = await snowGet(cookieHeader, bearerToken, gck, apiPath);

    if (res.status !== 200) {
      console.error(`\n❌ API call failed: HTTP ${res.status}`);
      console.error(JSON.stringify(res.body, null, 2).substring(0, 600));
      process.exit(1);
    }

    const records = res.body.result ?? [];
    console.log(`${records.length} records`);

    if (!records.length) break;

    allRecords.push(...records.map(flattenRecord));
    offset += records.length;

    // Check X-Total-Count header to see if we're done
    const total = parseInt(res.headers["x-total-count"] ?? "0", 10);
    if (total && offset >= total) break;
    if (records.length < PAGE_SIZE) break;
  }

  console.log(`\n   Total records fetched: ${allRecords.length}\n`);

  // ── Step 4: Write CSV ─────────────────────────────────────────────────────
  console.log(`Step 4: Writing CSV to ${OUTPUT}…`);
  writeCsv(OUTPUT, allRecords);
  console.log(`✅ Done! File saved: ${OUTPUT}`);
  console.log(
    `   Rows: ${allRecords.length}  |  Columns: ${allRecords.length ? Object.keys(allRecords[0]).length : 0}`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});
