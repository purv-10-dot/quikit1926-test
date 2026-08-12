import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(), // optional — features that need Redis (rate-limit, BullMQ) gracefully no-op when unset
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  COOKIE_SECURE: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),
  DEFAULT_ORG_ID: z.string().default("shield"),
  SEED_DEMO_PASSWORD: z.string().default("Password123!"),
  THROTTLE_TTL_MS: z.coerce.number().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().default(120),
  IMPORT_MAX_ATTEMPTS: z.coerce.number().default(3),
  IMPORT_WORKER_NAME: z.string().default("import-worker"),

  // IndiaVoice / RP Digital
  RP_DIGITAL_BASE_URL: z.string().default("https://indiavoice.rpdigitalphone.com"),
  /** Preferred auth per current spec — sent as `authcode` query param. */
  RP_DIGITAL_AUTHCODE: z.string().optional(),
  /** Legacy HTTP Basic auth (used only when RP_DIGITAL_AUTHCODE is unset). */
  RP_DIGITAL_BASIC_USER: z.string().optional(),
  RP_DIGITAL_BASIC_PASSWORD: z.string().optional(),
  RP_DIGITAL_DESKPHONE: z.string().optional(),
  RP_DIGITAL_CALLING_PARTY_A: z.string().optional(),
  RP_DIGITAL_WAITTIME: z.coerce.number().default(30),
  RP_DIGITAL_CALL_LIMIT: z.string().default("6516839"),
  RP_DIGITAL_UID: z.string().default("3641"),
  RP_DIGITAL_CALL_FROM_DID: z.string().default("1"),
  RP_DIGITAL_HTTP_TIMEOUT_MS: z.coerce.number().default(30_000),
  /** Required query param for GET /api_v3/update-working-status-v2 (swagger default: IVR). */
  RP_DIGITAL_WORKING_STATUS_DIRECTION: z.string().default("IVR"),
  /** Verbose telephony request/response logs (auto-on in non-production). */
  RP_DIGITAL_TELEPHONY_DEBUG: z.string().optional(),
  RP_DIGITAL_WEBHOOK_SECRET: z.string().optional(),

  WEBHOOK_DEFAULT_ORG_ID: z.string().optional(),
  // WEBHOOK_TRUST_PAYLOAD_ORG_ID removed: the telephony webhook no longer
  // derives the org from the request body under any setting, so the knob had
  // no effect and implied a safety control that did not exist.
  WEBHOOK_REQUIRE_SECRET: z.string().default("false"),

  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),

  // LeadSquared two-way sync. Host defaults to the India (in21) SYNCHRONOUS
  // API host (NOT the asyncapi- host) — keep configurable pending final
  // confirmation of the tenant's region. Keys are optional so the app boots
  // without them; the outbound client throws a clear error only when a push is
  // actually attempted without credentials.
  LEADSQUARED_HOST: z.string().default("https://api-in21.leadsquared.com"),
  LEADSQUARED_ACCESS_KEY: z.string().optional(),
  LEADSQUARED_SECRET_KEY: z.string().optional(),
  LEADSQUARED_HTTP_TIMEOUT_MS: z.coerce.number().default(30_000),
  // Inbound webhook (LeadSquared -> QuikCRM). Shared secret validated on the
  // webhook route; required only when WEBHOOK_REQUIRE_SECRET=true or in prod
  // (mirrors the telephony webhook). Single-client: tenant is resolved from
  // env, preferring the LeadSquared-specific override then the shared ones.
  LEADSQUARED_WEBHOOK_SECRET: z.string().optional(),
  LEADSQUARED_DEFAULT_ORG_ID: z.string().optional(),
  // Custom-field SchemaNames (mx_...). Set these once known; unset => that field
  // is skipped (backward-compatible). LEADSQUARED_SCHEMA_STAGE overrides the
  // standard "ProspectStage" default.
  LEADSQUARED_SCHEMA_STAGE: z.string().optional(),
  LEADSQUARED_SCHEMA_SUBSTAGE: z.string().optional(),
  LEADSQUARED_SCHEMA_STATUS: z.string().optional(),
  LEADSQUARED_SCHEMA_REMARKS: z.string().optional(),
  LEADSQUARED_SCHEMA_COUNTRY: z.string().optional(),
  LEADSQUARED_SCHEMA_INDUSTRY: z.string().optional(),
  LEADSQUARED_SCHEMA_WEBSITE: z.string().optional(),
  LEADSQUARED_SCHEMA_ADDRESS1: z.string().optional(),
  LEADSQUARED_SCHEMA_ADDRESS2: z.string().optional(),
  LEADSQUARED_SCHEMA_CITY: z.string().optional(),
  LEADSQUARED_SCHEMA_STATE: z.string().optional(),
  LEADSQUARED_SCHEMA_ZIP: z.string().optional(),
  // Ambiguous fields — enable only after confirming the SchemaName with the client.
  LEADSQUARED_SCHEMA_JOBTITLE: z.string().optional(),
  LEADSQUARED_SCHEMA_SECONDARY_EMAIL: z.string().optional(),
  LEADSQUARED_SCHEMA_ANNUAL_REVENUE: z.string().optional(),
  LEADSQUARED_SCHEMA_LEAD_TYPE: z.string().optional(),
  LEADSQUARED_SCHEMA_CONTACT_LINKEDIN: z.string().optional(),
  LEADSQUARED_SCHEMA_AREA: z.string().optional(),
  // Optional CRM->LSQ picklist value maps (JSON objects), e.g. {"Won":"ClosedWon"}.
  // For Select/Dropdown fields these also act as an allowlist: an out-of-list
  // value is skipped (not sent) instead of 500-ing the whole lead.
  LEADSQUARED_STAGE_VALUE_MAP: z.string().optional(),
  LEADSQUARED_SUBSTAGE_VALUE_MAP: z.string().optional(),
  LEADSQUARED_STATUS_VALUE_MAP: z.string().optional(),
  LEADSQUARED_INDUSTRY_VALUE_MAP: z.string().optional(),
  LEADSQUARED_SOURCE_VALUE_MAP: z.string().optional(),
  // Opt-in: auto-resolve missing SchemaNames via LeadsMetaData.Get (cached).
  LEADSQUARED_METADATA_AUTORESOLVE: z.string().optional(),
  // Validate configured SchemaNames against LeadsMetaData.Get and WARN on
  // mismatch/not-found. Default ON; set "false" to disable the metadata fetch.
  LEADSQUARED_VALIDATE_SCHEMA: z.string().optional(),
  // Skip a picklist attribute when its value isn't in the value map (never 500
  // the whole lead). Default ON; set "false" to send unknown values as-is.
  LEADSQUARED_SKIP_UNKNOWN_PICKLIST: z.string().optional(),
  // ── Inbound POLLER (safety net for LSQ changes that fire no webhook) ──
  // Interval in ms; 0/unset = poller DISABLED. Set e.g. 300000 (5 min) to enable.
  LEADSQUARED_POLL_INTERVAL_MS: z.coerce.number().default(0),
  // First-run look-back window when there's no watermark yet (default 10 min).
  LEADSQUARED_POLL_WINDOW_MS: z.coerce.number().default(600_000),
  // Re-scan overlap before the last watermark, to avoid boundary misses (2 min).
  LEADSQUARED_POLL_OVERLAP_MS: z.coerce.number().default(120_000),
  // Page size for the recently-modified fetch.
  LEADSQUARED_POLL_PAGE_SIZE: z.coerce.number().default(200),
  // Account timezone offset (minutes) for LSQ FromDate/ToDate. Default +330 (IST).
  LEADSQUARED_TZ_OFFSET_MINUTES: z.coerce.number().default(330),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[env] invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  if (isProd) {
    if (parsed.data.JWT_SECRET.length < 32 || /change-me|dev-only|placeholder/i.test(parsed.data.JWT_SECRET)) {
      throw new Error("JWT_SECRET must be set to a strong production value (≥32 chars, not a placeholder).");
    }
    if (parsed.data.WEBHOOK_REQUIRE_SECRET === "true" && !parsed.data.RP_DIGITAL_WEBHOOK_SECRET) {
      throw new Error("RP_DIGITAL_WEBHOOK_SECRET is required when WEBHOOK_REQUIRE_SECRET=true");
    }
  }
  cached = parsed.data;
  return cached;
}
