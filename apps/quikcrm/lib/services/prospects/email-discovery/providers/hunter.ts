/**
 * Hunter.io adapter.
 *
 * Two endpoints, used for different jobs:
 *   - email-finder  → a specific person's address, with a 0-100 score
 *   - domain-search → the company's dominant pattern, learned once per domain
 *
 * Both no-op when HUNTER_API_KEY is unset, so an unconfigured environment
 * degrades to the guess path instead of erroring. Every failure is swallowed
 * into null: this is one tier of a fallback chain, and a provider outage must
 * move to the next tier rather than fail the run.
 */
import { normalizeProviderPattern } from "../patterns";

const HUNTER_BASE = "https://api.hunter.io/v2";
const TIMEOUT_MS = 10_000;

export interface HunterFindResult {
  email: string;
  /** 0..1 — Hunter's `score` rebased from its native 0-100. */
  confidence: number;
  pattern: string;
}

function apiKey(): string {
  return (process.env.HUNTER_API_KEY || "").trim();
}

export function isHunterConfigured(): boolean {
  return apiKey().length > 0;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find one person's address at a domain.
 *
 * Hunter requires both names for a useful result; single-character values are
 * dropped rather than sent, since they only degrade the match.
 */
export async function hunterFindEmail(
  domain: string,
  firstName: string,
  lastName: string,
): Promise<HunterFindResult | null> {
  const key = apiKey();
  if (!key || !domain) return null;

  const params = new URLSearchParams({ domain, api_key: key });
  if (firstName.trim().length >= 2) params.set("first_name", firstName.trim());
  if (lastName.trim().length >= 2) params.set("last_name", lastName.trim());

  const json = await getJson(`${HUNTER_BASE}/email-finder?${params.toString()}`);
  const data = (json?.data ?? null) as Record<string, unknown> | null;
  const email = typeof data?.email === "string" ? data.email : "";
  if (!email) return null;

  const rawScore = typeof data?.score === "number" ? data.score : 0;
  return {
    email: email.toLowerCase(),
    // Hunter scores 0-100; the cascade works in 0..1 throughout.
    confidence: Math.max(0, Math.min(1, rawScore / 100)),
    pattern: normalizeProviderPattern(data?.pattern as string | undefined),
  };
}

/**
 * Ask Hunter for the company's dominant address pattern.
 *
 * Worth a separate call because the answer is reusable: it is cached per
 * (org, domain) in CrmOrgEmailPattern, so the second prospect at the same
 * company costs no credits at all. `limit=1` keeps the response small — we want
 * the `pattern` field, not the address list.
 */
export async function hunterDomainPattern(domain: string): Promise<string> {
  const key = apiKey();
  if (!key || !domain) return "";

  const params = new URLSearchParams({ domain, api_key: key, limit: "1" });
  const json = await getJson(`${HUNTER_BASE}/domain-search?${params.toString()}`);
  const data = (json?.data ?? null) as Record<string, unknown> | null;
  return normalizeProviderPattern(data?.pattern as string | undefined);
}
