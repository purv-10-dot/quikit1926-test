/**
 * One-time repair runner for historical Microsoft email threads.
 *
 *   Dry-run (default — reports, writes NOTHING):
 *     node apps/quikcrm/scripts/repair-microsoft-threads.mjs
 *   Apply the repair:
 *     node apps/quikcrm/scripts/repair-microsoft-threads.mjs --apply
 *   Restrict to one org:
 *     node apps/quikcrm/scripts/repair-microsoft-threads.mjs --apply --org=<orgId>
 *
 * Idempotent: safe to re-run. Only touches Microsoft rows; Gmail is untouched.
 * Loads apps/quikcrm/.env.local for DATABASE_URL, then delegates to the tested
 * repairMicrosoftThreads() service.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (line.startsWith("#") || !line.trim()) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!(line.slice(0, i).trim() in process.env)) process.env[line.slice(0, i).trim()] = v;
  }
}

const apply = process.argv.includes("--apply");
const orgArg = process.argv.find((a) => a.startsWith("--org="));
const orgId = orgArg ? orgArg.slice("--org=".length) : undefined;

const { repairMicrosoftThreads } = await import(
  pathToFileURL(
    path.join(__dirname, "..", "lib", "services", "email", "repair-microsoft-threads.ts"),
  ).href
);

console.log(`\n[repair-ms-threads] mode=${apply ? "APPLY (writes)" : "DRY-RUN (no writes)"}${orgId ? ` org=${orgId}` : ""}\n`);
const report = await repairMicrosoftThreads({ apply, orgId });

console.log("──────────── REPORT ────────────");
console.log(`Connections scanned : ${report.connectionsScanned}`);
console.log(`Rows scanned        : ${report.rowsScanned}`);
console.log(`Rows repaired       : ${report.rowsRepaired}`);
console.log(`Rows skipped        : ${report.rowsSkipped}`);
console.log(`Threads recounted   : ${report.threadsRecounted}`);
console.log(`Threads pruned      : ${report.threadsPruned}`);
console.log("────────────────────────────────");
for (const d of report.details) {
  const extra = d.outcome === "repaired" ? ` (${d.fromThread?.slice(-12) ?? "∅"} → ${d.toThread?.slice(-12)})` : "";
  console.log(`  ${d.outcome.padEnd(20)} "${(d.subject ?? "").slice(0, 40)}"${extra}`);
}
if (!apply) console.log("\nDRY-RUN complete — no rows were modified. Re-run with --apply to persist.\n");
else console.log("\nAPPLY complete.\n");

process.exit(0);
