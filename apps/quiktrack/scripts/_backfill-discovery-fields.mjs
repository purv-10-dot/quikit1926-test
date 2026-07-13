/**
 * Backfill the extended JPD attribute fields onto EXISTING discovery projects
 * (created before these fields were added to discoveryDefaults.ts). Additive and
 * idempotent: only creates fields/options/values that are missing. Local dev DB
 * only (reads DATABASE_URL). Run: node scripts/_backfill-discovery-fields.mjs
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
const { Client } = pg;

const S = "app_quiktrack";
const key = (name) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "field";
const cuid = () => "c" + randomUUID().replace(/-/g, "").slice(0, 24);

// The NEW fields (must mirror discoveryDefaults.DISCOVERY_FIELDS additions).
const NEW_FIELDS = [
  { name: "Customer segments", type: "DROPDOWN_MULTI", options: ["Enterprise", "Mid-market", "SMB", "Consumer"] },
  { name: "Value", type: "NUMBER" },
  { name: "Goals", type: "DROPDOWN_MULTI", options: ["Growth", "Retention", "Activation", "Revenue"] },
  { name: "Product Area", type: "DROPDOWN_SINGLE", options: ["Checkout", "Onboarding", "Platform", "Mobile"] },
  { name: "Project start", type: "DATE" },
  { name: "Project target", type: "DATE" },
  { name: "Category", type: "DROPDOWN_SINGLE", options: ["Sample ideas", "Customer request", "Internal", "Experiment"] },
  { name: "Spec ready", type: "CHECKBOX" },
  { name: "Designs ready", type: "CHECKBOX" },
  { name: "Idea short description", type: "SHORT_TEXT" },
  { name: "Delivery status", type: "DROPDOWN_SINGLE", options: ["Not started", "In progress", "Shipped"] },
];

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// Every discovery project.
const projects = (await c.query(
  `SELECT id, "orgId", "createdBy" FROM ${S}."QtProject" WHERE "templateKey" = 'discovery' AND "isDeleted" = false`,
)).rows;
console.log(`Discovery projects: ${projects.length}`);

for (const p of projects) {
  // Current max field position so new fields append.
  const maxPos = (await c.query(
    `SELECT COALESCE(MAX(position), -1) AS m FROM ${S}."QtCustomField" WHERE "projectId" = $1`,
    [p.id],
  )).rows[0].m;
  let pos = Number(maxPos) + 1;

  const fieldIdByKey = {};
  for (const f of NEW_FIELDS) {
    const k = key(f.name);
    const existing = (await c.query(
      `SELECT id FROM ${S}."QtCustomField" WHERE "projectId" = $1 AND key = $2 LIMIT 1`,
      [p.id, k],
    )).rows[0];
    let fieldId;
    if (existing) {
      fieldId = existing.id;
    } else {
      fieldId = cuid();
      await c.query(
        `INSERT INTO ${S}."QtCustomField" (id, "orgId", scope, "projectId", name, key, type, position, "createdBy", "isRequired", status, "isDeleted", "createdAt", "updatedAt")
         VALUES ($1,$2,'space',$3,$4,$5,$6,$7,$8,false,'active',false,NOW(),NOW())`,
        [fieldId, p.orgId, p.id, f.name, k, f.type, pos++, p.createdBy],
      );
      if (f.options?.length) {
        for (let i = 0; i < f.options.length; i++) {
          await c.query(
            `INSERT INTO ${S}."QtCustomFieldOption" (id, "fieldId", label, value, position, "isActive")
             VALUES ($1,$2,$3,$4,$5,true)`,
            [cuid(), fieldId, f.options[i], key(f.options[i]), i],
          );
        }
      }
      console.log(`  + field ${f.name} on ${p.id}`);
    }
    fieldIdByKey[k] = fieldId;
  }

  // Seed sample values on the FIRST idea (the "New rewards program" sample), to
  // match the reference — only if it has no value for that field yet.
  const firstIdea = (await c.query(
    `SELECT id, description FROM ${S}."QtIdea" WHERE "projectId" = $1 AND "isDeleted" = false ORDER BY "orderIndex" ASC LIMIT 1`,
    [p.id],
  )).rows[0];
  if (!firstIdea) continue;

  // Description (only if empty).
  if (!firstIdea.description) {
    const desc =
      "💡 Hypothesis\n\nCreating a reward program for our customers will increase the adoption of our travel booking platform.\n\nThis will benefit users by providing them with more advantages as they use the platform and will encourage new users to use the platform even more.\n\nWe will know if this is true if the number of travel booked per user per year significantly increases after the first six months of experimentation.\n\n✅ Validation\n\nAfter a runtime of 16 weeks, we saw the number of booking per user increase significantly: +17%. The number of returning users has also increased by 24%.\n\nThis validates our hypothesis that a reward program has increased our users' platform adoption.\n\n✔️ Decision\n\nWe will move this feature from Beta to make it generally available to all our customers as its benefit has been proven.";
    await c.query(`UPDATE ${S}."QtIdea" SET description = $1, "updatedAt" = NOW() WHERE id = $2`, [desc, firstIdea.id]);
  }

  const sampleValues = [
    ["value", "num", 5],
    ["category", "text", "sample_ideas"],
    ["customer_segments", "json", ["enterprise"]],
    ["spec_ready", "bool", true],
    ["designs_ready", "bool", true],
    ["idea_short_description", "text", "This is an idea about X"],
    ["project_start", "date", "2025-01-01"],
    ["project_target", "date", "2025-07-01"],
  ];
  for (const [k, kind, v] of sampleValues) {
    const fieldId = fieldIdByKey[k];
    if (!fieldId) continue;
    const has = (await c.query(
      `SELECT 1 FROM ${S}."QtIdeaFieldValue" WHERE "ideaId" = $1 AND "fieldId" = $2 LIMIT 1`,
      [firstIdea.id, fieldId],
    )).rows[0];
    if (has) continue;
    const cols = { valueText: null, valueNumber: null, valueDate: null, valueBoolean: null, valueJson: null };
    if (kind === "num") cols.valueNumber = v;
    else if (kind === "text") cols.valueText = v;
    else if (kind === "bool") cols.valueBoolean = v;
    else if (kind === "date") cols.valueDate = new Date(v);
    else if (kind === "json") cols.valueJson = JSON.stringify(v);
    await c.query(
      `INSERT INTO ${S}."QtIdeaFieldValue" (id, "orgId", "ideaId", "fieldId", "valueText", "valueNumber", "valueDate", "valueBoolean", "valueJson", "createdBy", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
      [cuid(), p.orgId, firstIdea.id, fieldId, cols.valueText, cols.valueNumber, cols.valueDate, cols.valueBoolean, cols.valueJson, p.createdBy],
    );
  }
  console.log(`  seeded sample values on first idea of ${p.id}`);
}

await c.end();
console.log("Backfill complete.");
