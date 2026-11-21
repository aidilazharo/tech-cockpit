#!/usr/bin/env node
// Checks every package in package-lock.json against the OSV vulnerability database
// (https://osv.dev). No dependencies; works in Git Bash and cmd.
// Usage: node osv-check.mjs <project-dir> [--json]
// Exit codes: 0 no known vulnerabilities, 1 vulnerabilities found, 2 error.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? ".");
const asJson = process.argv.includes("--json");
const BATCH = 500; // OSV querybatch accepts up to 1000 queries per call

function packagesFromLock(lockPath) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const found = new Map();
  for (const [path, info] of Object.entries(lock.packages ?? {})) {
    if (!path || info.link || !info.version) continue;
    const name =
      info.name ??
      path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    found.set(`${name}@${info.version}`, {
      name,
      version: info.version,
      dev: Boolean(info.dev),
    });
  }
  return [...found.values()];
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function fixedVersions(vuln, name) {
  const fixes = new Set();
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name !== name) continue;
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? [])
        if (event.fixed) fixes.add(event.fixed);
    }
  }
  return [...fixes];
}

try {
  const packages = packagesFromLock(join(dir, "package-lock.json"));
  const hits = [];
  for (let i = 0; i < packages.length; i += BATCH) {
    const chunk = packages.slice(i, i + BATCH);
    const { results } = await postJson("https://api.osv.dev/v1/querybatch", {
      queries: chunk.map((p) => ({
        package: { name: p.name, ecosystem: "npm" },
        version: p.version,
      })),
    });
    results.forEach((result, index) => {
      for (const vuln of result.vulns ?? [])
        hits.push({ ...chunk[index], id: vuln.id });
    });
  }

  const findings = [];
  for (const hit of hits) {
    const vuln = await getJson(
      `https://api.osv.dev/v1/vulns/${encodeURIComponent(hit.id)}`,
    );
    findings.push({
      package: hit.name,
      version: hit.version,
      dev: hit.dev,
      id: hit.id,
      aliases: vuln.aliases ?? [],
      severity: vuln.database_specific?.severity ?? "UNKNOWN",
      summary: vuln.summary ?? "",
      fixedIn: fixedVersions(vuln, hit.name),
    });
  }

  if (asJson) {
    console.log(
      JSON.stringify({ scanned: packages.length, findings }, null, 2),
    );
  } else {
    console.log(`OSV: scanned ${packages.length} packages in ${dir}`);
    for (const f of findings) {
      console.log(
        `- [${f.severity}] ${f.package}@${f.version}${f.dev ? " (dev)" : ""} ${f.id} ${f.aliases.join(" ")}\n` +
          `    ${f.summary}\n    fixed in: ${f.fixedIn.join(", ") || "no fix published"}`,
      );
    }
    console.log(
      findings.length === 0
        ? "No known vulnerabilities."
        : `${findings.length} finding(s).`,
    );
  }
  process.exit(findings.length === 0 ? 0 : 1);
} catch (error) {
  console.error(`osv-check failed: ${error.message}`);
  process.exit(2);
}
