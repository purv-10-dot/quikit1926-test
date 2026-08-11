/**
 * Resolves the runtime LeadSquaredFieldMapConfig for BOTH directions.
 *
 * Precedence:
 *   1. Explicit env SchemaNames (LEADSQUARED_SCHEMA_*) + value maps.
 *   2. Optional (opt-in) auto-resolution of still-missing SchemaNames via
 *      LeadsMetaData.Get, matched by DisplayName. Best-effort, cached.
 *
 * When nothing is configured this returns exactly DEFAULT_FIELD_MAP_CONFIG
 * (custom fields null → skipped) — i.e. today's behaviour. So enabling
 * Stage/Status sync is a pure configuration change, no code change.
 *
 * Reads process.env directly (like the client/inbound helpers) so it is
 * testable without a fully-populated env().
 */
import {
  DEFAULT_FIELD_MAP_CONFIG,
  type LeadSquaredFieldMapConfig,
} from "@/lib/services/leadsquared/field-map";
import { LeadSquaredClient, type LeadSquaredFieldMeta } from "@/lib/services/leadsquared/client";
import { logSync } from "@/lib/services/leadsquared/telemetry";

function parseJsonMap(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const o: unknown = JSON.parse(raw);
    if (o && typeof o === "object" && !Array.isArray(o)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return Object.keys(out).length ? out : undefined;
    }
  } catch {
    logSync("warn", "valuemap.parse.failed", {});
  }
  return undefined;
}

/** Build the config from env alone (synchronous, no network). Each configurable
 *  SchemaName falls back to its DEFAULT (standard fields keep their name; custom
 *  and ambiguous fields stay null -> skipped) when the env var is unset. */
export function buildFieldMapFromEnv(): LeadSquaredFieldMapConfig {
  const D = DEFAULT_FIELD_MAP_CONFIG;
  return {
    ...D,
    // Standard (overridable, defaults preserved):
    stage: process.env.LEADSQUARED_SCHEMA_STAGE || D.stage,
    // Custom (mx_) — null default; set via env to enable:
    status: process.env.LEADSQUARED_SCHEMA_STATUS || D.status,
    subStage: process.env.LEADSQUARED_SCHEMA_SUBSTAGE || D.subStage,
    country: process.env.LEADSQUARED_SCHEMA_COUNTRY || D.country,
    industry: process.env.LEADSQUARED_SCHEMA_INDUSTRY || D.industry,
    website: process.env.LEADSQUARED_SCHEMA_WEBSITE || D.website,
    addressLine1: process.env.LEADSQUARED_SCHEMA_ADDRESS1 || D.addressLine1,
    addressLine2: process.env.LEADSQUARED_SCHEMA_ADDRESS2 || D.addressLine2,
    cityName: process.env.LEADSQUARED_SCHEMA_CITY || D.cityName,
    stateName: process.env.LEADSQUARED_SCHEMA_STATE || D.stateName,
    postalCode: process.env.LEADSQUARED_SCHEMA_ZIP || D.postalCode,
    statusRemarks: process.env.LEADSQUARED_SCHEMA_REMARKS || D.statusRemarks,
    // Ambiguous — null default; set via env only after the client confirms:
    jobTitle: process.env.LEADSQUARED_SCHEMA_JOBTITLE || D.jobTitle,
    secondaryEmail: process.env.LEADSQUARED_SCHEMA_SECONDARY_EMAIL || D.secondaryEmail,
    annualRevenueDisplay: process.env.LEADSQUARED_SCHEMA_ANNUAL_REVENUE || D.annualRevenueDisplay,
    leadType: process.env.LEADSQUARED_SCHEMA_LEAD_TYPE || D.leadType,
    contactLinkedinUrl: process.env.LEADSQUARED_SCHEMA_CONTACT_LINKEDIN || D.contactLinkedinUrl,
    area: process.env.LEADSQUARED_SCHEMA_AREA || D.area,
    // Value maps (also act as picklist allowlists; identity when unset):
    stageValueMap: parseJsonMap(process.env.LEADSQUARED_STAGE_VALUE_MAP),
    subStageValueMap: parseJsonMap(process.env.LEADSQUARED_SUBSTAGE_VALUE_MAP),
    statusValueMap: parseJsonMap(process.env.LEADSQUARED_STATUS_VALUE_MAP),
    industryValueMap: parseJsonMap(process.env.LEADSQUARED_INDUSTRY_VALUE_MAP),
    sourceValueMap: parseJsonMap(process.env.LEADSQUARED_SOURCE_VALUE_MAP),
    // Skip unknown picklist values (never 500 a lead) unless explicitly disabled.
    skipUnknownPicklist: process.env.LEADSQUARED_SKIP_UNKNOWN_PICKLIST !== "false",
  };
}

/**
 * Expected DisplayName keyword(s) per logical field. Used to sanity-check a
 * configured SchemaName against the live metadata — if the resolved field's
 * DisplayName contains none of these, the mapping is probably wrong (e.g.
 * mx_Country -> "Demo Taken By"). Heuristic, warn-only.
 */
const EXPECTED_DISPLAY_KEYWORDS: Record<string, string[]> = {
  status: ["status"],
  subStage: ["sub stage", "substage", "stage"],
  stage: ["stage"],
  country: ["country"],
  industry: ["industry"],
  website: ["url", "website"],
  cityName: ["city"],
  stateName: ["state"],
  postalCode: ["zip", "postal", "pin"],
  addressLine1: ["address", "street"],
  addressLine2: ["address", "street"],
  statusRemarks: ["remark", "note"],
  jobTitle: ["title", "designation"],
  secondaryEmail: ["email"],
  annualRevenueDisplay: ["revenue"],
  leadType: ["type"],
  contactLinkedinUrl: ["linkedin"],
  area: ["area", "locality"],
};

export interface FieldMapValidationWarning {
  field: string;
  schemaName: string;
  displayName?: string;
  reason: "not-found" | "displayname-mismatch";
}

/**
 * Validate configured SchemaNames against the live LeadsMetaData.Get response.
 * Returns warnings for names that don't exist or whose DisplayName looks wrong
 * for the logical field. Pure + warn-only — NEVER hard-fails a sync.
 */
export function validateFieldMap(
  config: LeadSquaredFieldMapConfig,
  metadata: LeadSquaredFieldMeta[],
): FieldMapValidationWarning[] {
  const bySchema = new Map(metadata.map((m) => [m.SchemaName, m.DisplayName]));
  const warnings: FieldMapValidationWarning[] = [];
  for (const [field, keywords] of Object.entries(EXPECTED_DISPLAY_KEYWORDS)) {
    const schemaName = config[field as keyof LeadSquaredFieldMapConfig] as string | null;
    if (!schemaName) continue; // unmapped -> nothing to validate
    if (!bySchema.has(schemaName)) {
      warnings.push({ field, schemaName, reason: "not-found" });
      continue;
    }
    const displayName = bySchema.get(schemaName) ?? "";
    const dn = displayName.toLowerCase();
    if (!keywords.some((k) => dn.includes(k))) {
      warnings.push({ field, schemaName, displayName, reason: "displayname-mismatch" });
    }
  }
  return warnings;
}

const displayName = (key: string, fallback: string) => process.env[key] || fallback;

/** Match custom SchemaNames from metadata by (case-insensitive) DisplayName. */
export function resolveSchemaNamesFromMetadata(
  metadata: LeadSquaredFieldMeta[],
): Pick<LeadSquaredFieldMapConfig, "stage" | "subStage" | "status" | "statusRemarks"> {
  const byDisplay = new Map(metadata.map((m) => [m.DisplayName.trim().toLowerCase(), m.SchemaName]));
  const find = (name: string) => byDisplay.get(name.trim().toLowerCase()) ?? null;
  return {
    stage: find(displayName("LEADSQUARED_DISPLAY_STAGE", "Stage")),
    subStage: find(displayName("LEADSQUARED_DISPLAY_SUBSTAGE", "Sub Stage")),
    status: find(displayName("LEADSQUARED_DISPLAY_STATUS", "Status")),
    statusRemarks: find(displayName("LEADSQUARED_DISPLAY_REMARKS", "Remarks")),
  };
}

let cache: { config: LeadSquaredFieldMapConfig; at: number } | null = null;
const TTL_MS = Number(process.env.LEADSQUARED_METADATA_TTL_MS) || 3_600_000;

export interface ResolveDeps {
  client?: Pick<LeadSquaredClient, "getLeadMetaData">;
  clock?: () => number;
  forceRefresh?: boolean;
}

/** Test helper — clear the cache between cases. */
export function resetFieldMapCache(): void {
  cache = null;
}

function safeClientFromEnv(): Pick<LeadSquaredClient, "getLeadMetaData"> | undefined {
  try {
    return LeadSquaredClient.fromEnv();
  } catch {
    return undefined; // no credentials — can't auto-resolve
  }
}

export async function getResolvedFieldMap(
  deps: ResolveDeps = {},
): Promise<LeadSquaredFieldMapConfig> {
  const clock = deps.clock ?? (() => Date.now());
  if (!deps.forceRefresh && cache && clock() - cache.at < TTL_MS) return cache.config;

  let config = buildFieldMapFromEnv();

  const autoResolve = process.env.LEADSQUARED_METADATA_AUTORESOLVE === "true";
  // Safety validation of configured SchemaNames against live metadata. Default
  // ON; set LEADSQUARED_VALIDATE_SCHEMA=false to disable (e.g. to avoid the
  // metadata fetch on the Redis-off inbound inline path).
  const validate = process.env.LEADSQUARED_VALIDATE_SCHEMA !== "false";
  const missing = !config.stage || !config.subStage || !config.status || !config.statusRemarks;

  // Fetch metadata at most once, reused for both auto-resolve and validation.
  if ((autoResolve && missing) || validate) {
    const client = deps.client ?? safeClientFromEnv();
    if (client) {
      let metadata: LeadSquaredFieldMeta[] | null = null;
      try {
        metadata = await client.getLeadMetaData();
      } catch (e) {
        logSync("warn", "metadata.fetch.failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
      if (metadata) {
        if (autoResolve && missing) {
          const resolved = resolveSchemaNamesFromMetadata(metadata);
          // Env wins; metadata only fills what env left null.
          config = {
            ...config,
            stage: config.stage ?? resolved.stage,
            subStage: config.subStage ?? resolved.subStage,
            status: config.status ?? resolved.status,
            statusRemarks: config.statusRemarks ?? resolved.statusRemarks,
          };
        }
        if (validate) {
          // Warn-only — surfaces wrong/guessed SchemaNames loudly (e.g.
          // mx_Country -> "Demo Taken By") instead of silent 500s. Never fails.
          for (const w of validateFieldMap(config, metadata)) {
            logSync("warn", "fieldmap.schema.mismatch", {
              field: w.field,
              schemaName: w.schemaName,
              displayName: w.displayName ?? "",
              reason: w.reason,
            });
          }
        }
      }
    }
  }

  cache = { config, at: clock() };
  return config;
}
