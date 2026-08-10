import { prisma } from "@/lib/db/prisma";
import { listCustomFields } from "@/lib/services/fields/repo";
import { isValidFieldKey } from "@/types/field-definition";

/**
 * Resolve the pickable VALUES for a lead-filter field, so the advanced-filter
 * value box can render a searchable checkbox list instead of a bare text input.
 *
 * This is the "value population" half of the advanced-filter feature — the UI
 * shell (searchable multi-select) already exists in components/filters/
 * condition-row.tsx; it just had nothing to populate custom fields with. The
 * client fetches this LAZILY, per field, when a condition targets that field
 * (there are 200+ custom fields, so eager fetching is a non-starter).
 *
 * Resolution priority (first match wins):
 *   1. stage / status / substatus            → the tenant's pipeline config
 *   2. custom field WITH configured options   → those options (clean + complete,
 *                                               incl. values no lead has used yet)
 *   3. custom field, enum-ish, low-cardinality → capped DB-distinct on the data
 *   4. everything else                        → { source: "none" } → the client
 *                                               keeps its free-text / number / date input
 *
 * Why capped DB-distinct: CredFlow has ZERO Select/MultiSelect fields — every
 * enum is a Text field with no configured options — so the ONLY value source for
 * their enums is the data itself. But a distinct over a free-text field (notes,
 * ad_name, prospect_id) is thousands of rows: useless as a picker and heavy to
 * query. PICKER_MAX gates that: at most PICKER_MAX+1 rows are fetched, and if the
 * field has more than PICKER_MAX distinct values it is treated as free-text.
 */

/**
 * Max distinct values offered as a checkbox picker. Above this the list is too
 * long to be useful and the client falls back to a free-text `contains` input.
 * Chosen from CredFlow's real data: enum fields cluster at <=41 distinct, the
 * next field jumps to 62 — so ~50 is a clean, natural cutoff.
 */
export const PICKER_MAX = 50;

export type FieldValueOption = { value: string; label: string };

export type FieldValuesResult =
  | { source: "pipeline" | "options" | "distinct"; values: FieldValueOption[] }
  | { source: "none"; values: null; reason: "free_text" | "unknown_field" };

function toOpts(values: string[]): FieldValueOption[] {
  return values.map((v) => ({ value: v, label: v }));
}

/** Read the tenant's configured pipeline stages / statuses / substatuses. */
async function readPipeline(
  orgId: string,
): Promise<{ stages: string[]; statuses: string[]; substatuses: string[] }> {
  const ws = await prisma.qcfOrgWorkspaceSettings.findUnique({ where: { orgId } });
  const settings = (ws?.settings as Record<string, unknown> | null) ?? {};
  const cfg =
    (settings.leadPipelineConfig as
      | { stages?: string[]; statuses?: string[]; substatuses?: string[] }
      | undefined) ?? {};
  return {
    stages: Array.isArray(cfg.stages) ? cfg.stages : [],
    statuses: Array.isArray(cfg.statuses) ? cfg.statuses : [],
    substatuses: Array.isArray(cfg.substatuses) ? cfg.substatuses : [],
  };
}

/**
 * DISTINCT non-empty values for a custom (dynamicFields) key, frequency-ordered,
 * capped at PICKER_MAX+1 so "too many" is detectable without a separate COUNT.
 *
 * SAFETY: the JSON key is passed as a BOUND PARAMETER (never string-interpolated),
 * and the caller has already validated it (isValidFieldKey + it exists in the
 * org's field defs). Live leads only (deletedAt IS NULL), tenant-scoped.
 */
async function distinctDynamicValues(orgId: string, key: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ v: string | null; n: number }[]>`
    SELECT "dynamicFields" ->> ${key} AS v, count(*)::int AS n
    FROM app_quikcredflow."CrmLead"
    WHERE "orgId" = ${orgId}
      AND "deletedAt" IS NULL
      AND nullif("dynamicFields" ->> ${key}, '') IS NOT NULL
    GROUP BY 1
    ORDER BY n DESC
    LIMIT ${PICKER_MAX + 1}
  `;
  return rows.map((r) => r.v).filter((v): v is string => v != null);
}

/** Custom-field types that can sensibly offer a value list. Number/Date drive
 *  their own inputs (spinner / date picker) and never a distinct-value picker. */
const PICKABLE_CUSTOM_TYPES = new Set(["Select", "MultiSelect", "Text", "Email", "Phone"]);

/**
 * Real (non-dynamicFields) QcfLead columns that are enum-ish enough to offer a
 * value picker via capped DB-distinct. These are standard columns like `source`
 * that are NOT pipeline fields and NOT dynamicFields keys, so the pipeline and
 * custom branches both miss them — this whitelist is what gives e.g. Source its
 * `in` multiselect in both the advanced filter and automation conditions.
 *
 * SECURITY: this is an ALLOW-LIST of literal column identifiers. Each entry maps
 * to a hard-coded query below — the field key is NEVER interpolated into SQL.
 */
const REAL_COLUMN_DISTINCT = new Set([
  "source",
  "leadQuality",
  "industry",
  "country",
  "cityName",
  "stateName",
  "jobTitle",
]);

/**
 * DISTINCT non-empty values for a whitelisted REAL column. The column is chosen
 * from REAL_COLUMN_DISTINCT (never caller input) and each maps to a fixed query,
 * so there is no SQL injection surface. Live leads only, tenant-scoped, capped.
 */
async function distinctRealColumn(orgId: string, column: string): Promise<string[]> {
  // Hard-coded per-column queries — no identifier interpolation.
  const q = (rows: { v: string | null }[]) =>
    rows.map((r) => r.v).filter((v): v is string => v != null && v !== "");
  switch (column) {
    case "source":
      return q(await prisma.$queryRaw<{ v: string | null }[]>`
        SELECT source AS v FROM app_quikcredflow."CrmLead"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND nullif(source, '') IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT ${PICKER_MAX + 1}`);
    case "leadQuality":
      return q(await prisma.$queryRaw<{ v: string | null }[]>`
        SELECT "leadQuality" AS v FROM app_quikcredflow."CrmLead"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND nullif("leadQuality", '') IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT ${PICKER_MAX + 1}`);
    case "industry":
      return q(await prisma.$queryRaw<{ v: string | null }[]>`
        SELECT industry AS v FROM app_quikcredflow."CrmLead"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND nullif(industry, '') IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT ${PICKER_MAX + 1}`);
    case "country":
      return q(await prisma.$queryRaw<{ v: string | null }[]>`
        SELECT country AS v FROM app_quikcredflow."CrmLead"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND nullif(country, '') IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT ${PICKER_MAX + 1}`);
    case "cityName":
      return q(await prisma.$queryRaw<{ v: string | null }[]>`
        SELECT "cityName" AS v FROM app_quikcredflow."CrmLead"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND nullif("cityName", '') IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT ${PICKER_MAX + 1}`);
    case "stateName":
      return q(await prisma.$queryRaw<{ v: string | null }[]>`
        SELECT "stateName" AS v FROM app_quikcredflow."CrmLead"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND nullif("stateName", '') IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT ${PICKER_MAX + 1}`);
    case "jobTitle":
      return q(await prisma.$queryRaw<{ v: string | null }[]>`
        SELECT "jobTitle" AS v FROM app_quikcredflow."CrmLead"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND nullif("jobTitle", '') IS NOT NULL
        GROUP BY 1 ORDER BY count(*) DESC LIMIT ${PICKER_MAX + 1}`);
    default:
      return [];
  }
}

/**
 * Active tenant users as { value: userId, label: "Name (email)" } — the value
 * source for people fields like `ownerId`. Owner conditions store the user id,
 * so the picker shows names/emails while the stored value stays the id.
 */
async function ownerUserOptions(orgId: string): Promise<FieldValueOption[]> {
  const members = await prisma.orgMember.findMany({
    where: { orgId: orgId, status: "active" },
    select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members
    .map((m) => m.user)
    .filter((u): u is NonNullable<typeof u> => u != null)
    .map((u) => {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      const label = name ? (u.email ? `${name} (${u.email})` : name) : u.email;
      return { value: u.id, label };
    });
}

export async function resolveFieldValues(
  orgId: string,
  fieldKey: string,
): Promise<FieldValuesResult> {
  // 1) Standard pipeline-backed fields.
  if (fieldKey === "stage" || fieldKey === "status" || fieldKey === "substatus") {
    const p = await readPipeline(orgId);
    const values = fieldKey === "stage" ? p.stages : fieldKey === "status" ? p.statuses : p.substatuses;
    if (values.length === 0) return { source: "none", values: null, reason: "free_text" };
    return { source: "pipeline", values: toOpts(values) };
  }

  // 1b) People fields — ownerId resolves to the tenant's user list (id → name).
  if (fieldKey === "ownerId") {
    const opts = await ownerUserOptions(orgId);
    if (opts.length === 0) return { source: "none", values: null, reason: "free_text" };
    return { source: "distinct", values: opts };
  }

  // 1c) Whitelisted REAL standard columns (source, leadQuality, …) — capped
  //     DB-distinct on the actual column. This is what gives Source its picker
  //     in both the advanced filter and automation conditions.
  if (REAL_COLUMN_DISTINCT.has(fieldKey)) {
    const values = await distinctRealColumn(orgId, fieldKey);
    if (values.length === 0 || values.length > PICKER_MAX) {
      return { source: "none", values: null, reason: "free_text" };
    }
    return { source: "distinct", values: toOpts(values) };
  }

  // Custom (dynamicFields) fields — resolve against the org's LIVE defs so an
  // unknown/removed key can't reach the raw query.
  if (!isValidFieldKey(fieldKey)) return { source: "none", values: null, reason: "unknown_field" };
  const customs = await listCustomFields(orgId);
  const def = customs.find((d) => d.key === fieldKey);
  if (!def) return { source: "none", values: null, reason: "unknown_field" };

  // 2) Configured options win — clean and complete (includes values no lead has
  //    used yet). CredFlow has none of these today, but it's the right priority.
  if (def.options && def.options.length > 0) {
    return { source: "options", values: toOpts(def.options) };
  }

  // 3) Only enum-ish types get a data-distinct picker.
  if (!PICKABLE_CUSTOM_TYPES.has(def.fieldType)) {
    return { source: "none", values: null, reason: "free_text" };
  }

  // 4) Capped DB-distinct. Empty or too-many → free-text.
  const values = await distinctDynamicValues(orgId, fieldKey);
  if (values.length === 0 || values.length > PICKER_MAX) {
    return { source: "none", values: null, reason: "free_text" };
  }
  return { source: "distinct", values: toOpts(values) };
}
