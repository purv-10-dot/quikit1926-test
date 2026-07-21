import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(), // optional — features that need Redis (rate-limit, BullMQ) gracefully no-op when unset
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
  WEBHOOK_TRUST_PAYLOAD_ORG_ID: z.string().default("true"),
  WEBHOOK_REQUIRE_SECRET: z.string().default("false"),

  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),

  // ── Email integration (per-user mailbox OAuth) ──────────────────────────────
  // All optional: when a provider's client creds or the encryption key are
  // unset, that provider's Connect button is hidden and the sync cron no-ops.
  // Same graceful-degradation contract as the RP_DIGITAL telephony vars above.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  /** Entra tenant; "common" allows any work/school + personal Microsoft account. */
  MICROSOFT_TENANT_ID: z.string().default("common"),
  /**
   * Base64-encoded 32-byte key for AES-256-GCM encryption of stored OAuth
   * tokens (see lib/crypto/token-cipher.ts). Required to connect a mailbox;
   * when absent the connect flow returns a clear 503.
   */
  MAILBOX_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  /**
   * Absolute base URL the OAuth provider redirects back to (the callback route
   * is appended). Defaults to NEXT_PUBLIC_APP_URL — set explicitly in prod so
   * it matches the redirect URI registered with Google/Microsoft.
   */
  MAILBOX_OAUTH_REDIRECT_BASE: z.string().optional(),
  /**
   * One-time historical backfill window (days) run when a mailbox first
   * connects — Inbox + Sent since now-N-days are imported and matched to CRM
   * records, then incremental sync takes over. Default 90.
   */
  MAILBOX_BACKFILL_DAYS: z.coerce.number().int().positive().default(90),
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
    if (parsed.data.WEBHOOK_REQUIRE_SECRET === "true" && !parsed.data.RP_DIGITAL_WEBHOOK_SECRET) {
      throw new Error("RP_DIGITAL_WEBHOOK_SECRET is required when WEBHOOK_REQUIRE_SECRET=true");
    }
  }
  cached = parsed.data;
  return cached;
}
