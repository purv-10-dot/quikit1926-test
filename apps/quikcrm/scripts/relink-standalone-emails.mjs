/**
 * One-time backfill: retroactively link standalone mailbox emails to existing
 * Leads whose email address matches. Needed for leads created BEFORE the
 * create/update re-link hook existed. New leads are handled automatically by
 * the route hooks — this is only for pre-existing data.
 *
 *   Dry-run (default — counts matches, writes NOTHING):
 *     npx tsx apps/quikcrm/scripts/relink-standalone-emails.mjs
 *   Apply:
 *     npx tsx apps/quikcrm/scripts/relink-standalone-emails.mjs --apply
 *   One org only:
 *     npx tsx apps/quikcrm/scripts/relink-standalone-emails.mjs --apply --org=<orgId>
 *
 * Idempotent: already-linked emails are excluded, so a rerun links nothing new.
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

const { backfillRelinkAllLeads } = await import(
  pathToFileURL(path.join(__dirname, "..", "lib", "services", "email", "relink.ts")).href
);

console.log(`\n[relink-backfill] mode=${apply ? "APPLY (writes)" : "DRY-RUN (no writes)"}${orgId ? ` org=${orgId}` : ""}\n`);
const r = await backfillRelinkAllLeads({ apply, orgId });

console.log("──────────── REPORT ────────────");
console.log(`Leads scanned        : ${r.leadsScanned}`);
console.log(`Leads with links     : ${r.leadsWithLinks}`);
console.log(`Threads relinked     : ${r.threadsRelinked}`);
console.log(`Messages relinked    : ${r.messagesRelinked}`);
console.log(`Activities relinked  : ${r.activitiesRelinked}`);
console.log(`Mailbox rows linked  : ${r.mailboxRowsLinked}`);
console.log(`Errors               : ${r.errors}`);
console.log("────────────────────────────────");
if (!apply) {
  console.log("\nDRY-RUN — no rows modified. 'Mailbox rows linked' = rows that WOULD link. Re-run with --apply.\n");
} else {
  console.log("\nAPPLY complete.\n");
}
process.exit(r.errors > 0 ? 1 : 0);
