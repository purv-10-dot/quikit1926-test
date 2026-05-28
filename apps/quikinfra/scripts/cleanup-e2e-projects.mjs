/**
 * Remove Playwright e2e fixture projects from the UI.
 *
 * E2E tests POST real rows named "E2E Test Project …" into the same DB
 * as local dev. This script soft-deletes them (status = inactive), which
 * matches the app's normal DELETE /api/masters/projects/:id behaviour.
 *
 * Usage (from repo root):
 *   node scripts/cleanup-e2e-projects.mjs
 *   node scripts/cleanup-e2e-projects.mjs --dry-run
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../node_modules/.prisma-qc2/client/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnv(envPath);

const PREFIX = "E2E Test Project ";
const dryRun = process.argv.includes("--dry-run");

const prisma = new PrismaClient();

try {
  const rows = await prisma.cnProject.findMany({
    where: {
      name: { startsWith: PREFIX, mode: "insensitive" },
      status: { not: "inactive" },
    },
    select: { id: true, code: true, name: true, tenantId: true },
    orderBy: { createdAt: "desc" },
  });

  console.log(
    dryRun
      ? `[dry-run] Would deactivate ${rows.length} project(s):`
      : `Deactivating ${rows.length} e2e fixture project(s):`,
  );
  for (const r of rows) {
    console.log(`  - ${r.code}  ${r.name}`);
  }

  if (dryRun || rows.length === 0) {
    process.exit(0);
  }

  const res = await prisma.cnProject.updateMany({
    where: {
      name: { startsWith: PREFIX, mode: "insensitive" },
      status: { not: "inactive" },
    },
    data: { status: "inactive", updatedBy: "cleanup-e2e-script" },
  });

  console.log(`Done. ${res.count} project(s) set to inactive. Refresh Masters → Projects.`);
} catch (err) {
  console.error("Cleanup failed:", err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
