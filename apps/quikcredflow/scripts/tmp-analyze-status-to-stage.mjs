/**
 * TEMP — analyze whether the Stage->Status map can become "WHEN Status -> Set
 * Contact Stage" automation rules. A status that appears under >1 stage is
 * AMBIGUOUS (first-match-wins -> only one target ever fires). Only 1-stage
 * statuses make safe rules.
 *
 *   npx tsx scripts/tmp-analyze-status-to-stage.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(__dirname, "stage-status-map.tsv"), "utf8");

const statusToStages = {}; // status -> Set(stages)
for (const line of raw.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const t = line.indexOf("\t");
  if (t < 0) continue;
  const stage = line.slice(0, t).trim();
  const status = line.slice(t + 1).trim();
  (statusToStages[status] ??= new Set()).add(stage);
}

const safe = [];
const ambiguous = [];
for (const [status, stages] of Object.entries(statusToStages)) {
  if (stages.size === 1) safe.push([status, [...stages][0]]);
  else ambiguous.push([status, stages.size]);
}

console.log(`Total unique statuses: ${Object.keys(statusToStages).length}`);
console.log(`\nSAFE (status -> exactly 1 stage) = ${safe.length}:`);
safe.forEach(([s, st]) => console.log(`   WHEN Status is "${s}"  ->  Set Contact Stage to "${st}"`));

console.log(`\nAMBIGUOUS (status appears under many stages -> CANNOT be a single rule) = ${ambiguous.length}:`);
ambiguous
  .sort((a, b) => b[1] - a[1])
  .forEach(([s, n]) => console.log(`   "${s}"  -> ${n} stages`));
