/**
 * Shared types for the prospect email-discovery cascade.
 *
 * Ported from the email-automation project's cron cascade, with two deliberate
 * departures documented here because they change what the statuses MEAN:
 *
 * 1. NO SMTP PROBING. The original validated candidates with a live RCPT-TO
 *    probe on port 25. Vercel blocks outbound 25 on Functions, so that step
 *    cannot run here. Everything downstream that depended on it (catch-all
 *    detection, AI-guess validation) is dropped with it.
 *
 * 2. CONSEQUENTLY, "verified" IS WEAKER THAN IT SOUNDS. It means a data
 *    provider returned the address with a score above threshold — not that mail
 *    was ever delivered to it. Nothing in this module can make a stronger claim.
 */

/** Where an address came from. Drives the promotion decision in cascade.ts. */
export type DiscoverySource =
  | "hunter"
  | "apollo"
  | "pattern_memory"
  | "public_inference"
  | "guess";

export type DiscoveryStatus =
  /** A provider returned it with confidence at or above PROMOTE_MIN_CONFIDENCE. */
  | "verified"
  /** We built something plausible, but nothing confirmed it. Never promoted. */
  | "guessed"
  /** Domain resolved, but no provider or pattern produced an address. */
  | "not_found"
  /** No company domain with an MX record could be resolved. */
  | "domain_not_found"
  /** Not enough input to even begin — no company name and no domain hint. */
  | "company_invalid";

/** Input to the cascade. Assembled from a CrmProspect row by the route. */
export interface DiscoveryInput {
  fullName: string;
  companyName?: string | null;
  /** Promoted from CrmProspect.companyWebsite — the strongest domain hint we hold. */
  companyWebsite?: string | null;
  linkedinUrl?: string | null;
  title?: string | null;
}

export interface DiscoveryResult {
  status: DiscoveryStatus;
  email?: string;
  /** 0..1. Provider score where one exists, else a fixed per-source value. */
  confidence: number;
  domain?: string;
  pattern?: string;
  source?: DiscoverySource;
  /** Provider/parse failure detail, surfaced for debugging a fruitless run. */
  error?: string;
}
