/**
 * PCI DSS application-layer guards.
 *
 * This application is SAQ A scope: it never stores, processes, or transmits
 * cardholder data — payments are handled by Razorpay's hosted payment pages.
 * These helpers (1) fail fast in production when the secrets that protect data
 * at rest / sessions are missing or weak, and (2) provide a static scanner that
 * keeps cardholder-data fields out of the codebase so the SAQ A scope holds.
 */

export type SecurityViolation = { key: string; severity: "critical" | "warn"; message: string };

/** Validate the security-critical environment. Pure — returns violations. */
export function auditEnvSecurity(env: Record<string, string | undefined>, nodeEnv: string | undefined): SecurityViolation[] {
  const v: SecurityViolation[] = [];
  const prod = nodeEnv === "production";

  const authSecret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  if (!authSecret || authSecret.length < 32) {
    v.push({ key: "AUTH_SECRET", severity: prod ? "critical" : "warn", message: "AUTH_SECRET must be set and at least 32 characters (session signing)." });
  }
  if (!env.DATABASE_URL) {
    v.push({ key: "DATABASE_URL", severity: prod ? "critical" : "warn", message: "DATABASE_URL must be configured." });
  }
  const encKey = env.CONTACT_ENCRYPTION_KEY ?? env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!encKey || encKey.length < 16) {
    v.push({ key: "CONTACT_ENCRYPTION_KEY", severity: prod ? "critical" : "warn", message: "An encryption key (>=16 chars) is required to encrypt sensitive data at rest." });
  }
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? env.APP_URL;
  if (prod && appUrl && !appUrl.startsWith("https://")) {
    v.push({ key: "APP_URL", severity: "critical", message: "In production the app URL must be HTTPS (PCI Req 4)." });
  }
  if (prod && !env.CRON_SECRET) {
    v.push({ key: "CRON_SECRET", severity: "warn", message: "Set CRON_SECRET to protect scheduled/worker endpoints." });
  }
  return v;
}

/** Throw in production when any critical security violation is present. */
export function assertProductionSecurity(env: Record<string, string | undefined> = process.env, nodeEnv: string | undefined = process.env.NODE_ENV): void {
  if (nodeEnv !== "production") return;
  const critical = auditEnvSecurity(env, nodeEnv).filter((x) => x.severity === "critical");
  if (critical.length) {
    throw new Error(`Refusing to start: insecure production configuration — ${critical.map((c) => c.key).join(", ")}. ${critical.map((c) => c.message).join(" ")}`);
  }
}

/**
 * Patterns for cardholder data (CHD) and sensitive authentication data (SAD).
 * NOTE: deliberately does NOT match the Indian tax "PAN" (Permanent Account
 * Number) — only payment-card field names.
 */
export const CARD_DATA_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "card_number", re: /\bcard[_-]?number\b/i },
  { name: "cardholder", re: /\bcard[_-]?holder(_?name)?\b/i },
  { name: "primary_account_number", re: /\bprimary[_-]?account[_-]?number\b/i },
  { name: "cvv/cvc", re: /\b(cvv2?|cvc2?|cav2?)\b/i },
  // Require card context for "expiry" so document validity dates (quotes, etc.)
  // are not false-positives; "exp_month/exp_year" are card-specific on their own.
  { name: "card_expiry", re: /\bcard[_-]?(exp(iry|iration))[_-]?(date|month|year)\b/i },
  { name: "card_exp_month_year", re: /\b(exp(iry|iration))[_-]?(month|year)\b/i },
  { name: "track_data", re: /\btrack[_-]?[12][_-]?data\b/i },
  { name: "magnetic_stripe", re: /\b(magnetic[_-]?stripe|magstripe)\b/i },
  { name: "pin_block", re: /\bpin[_-]?block\b/i }
];

/** Returns the CHD/SAD field patterns found in a blob of source/SQL. */
export function scanForCardData(text: string): string[] {
  return CARD_DATA_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}
