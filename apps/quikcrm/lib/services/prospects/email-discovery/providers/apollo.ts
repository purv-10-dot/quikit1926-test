/**
 * Apollo.io adapter — final provider tier.
 *
 * NET-NEW CODE. Unlike every other part of this module there was no Apollo
 * integration in the source project to port; its cascade ended at Hunter.
 *
 * Apollo's `people/match` resolves a person from name + company/domain and,
 * when the plan allows, returns their work email. Two behaviours worth knowing:
 *
 *  - Apollo redacts addresses it will not spend a credit on, returning the
 *    literal string "email_not_unlocked@domain.com". That is a sentinel, not an
 *    address, and is rejected below — writing it into the CRM would be a bug
 *    that looks like data.
 *  - The API returns no per-address confidence score. We assign a fixed 0.85:
 *    high enough to clear the promotion bar (Apollo returning a specific
 *    unredacted address is a genuine match, not a pattern guess), but below a
 *    scored Hunter hit so ordering between the two stays meaningful.
 */

const APOLLO_ENDPOINT = "https://api.apollo.io/api/v1/people/match";
const TIMEOUT_MS = 10_000;

/** Apollo's placeholder for an address it declined to unlock. */
const REDACTED_SENTINEL = "email_not_unlocked";

/** Fixed score for an Apollo hit — the API returns no confidence of its own. */
export const APOLLO_CONFIDENCE = 0.85;

export interface ApolloFindResult {
  email: string;
  confidence: number;
}

function apiKey(): string {
  return (process.env.APOLLO_API_KEY || "").trim();
}

export function isApolloConfigured(): boolean {
  return apiKey().length > 0;
}

/**
 * Look up one person's work email.
 *
 * `reveal_personal_emails` is deliberately NOT set: personal addresses are
 * consumer mailboxes, they cost extra credits, and mailing one from a B2B CRM
 * is exactly the kind of contact a prospect complains about.
 */
export async function apolloFindEmail(args: {
  fullName: string;
  domain?: string | null;
  companyName?: string | null;
  linkedinUrl?: string | null;
}): Promise<ApolloFindResult | null> {
  const key = apiKey();
  if (!key) return null;

  const fullName = args.fullName.trim();
  if (!fullName) return null;

  const body: Record<string, unknown> = { name: fullName };
  if (args.domain) body.domain = args.domain;
  else if (args.companyName) body.organization_name = args.companyName;
  if (args.linkedinUrl) body.linkedin_url = args.linkedinUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(APOLLO_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as Record<string, unknown>;
    const person = (json?.person ?? null) as Record<string, unknown> | null;
    const email = typeof person?.email === "string" ? person.email.toLowerCase().trim() : "";

    // Reject both the redaction sentinel and anything that isn't an address.
    if (!email || email.includes(REDACTED_SENTINEL) || !email.includes("@")) return null;

    return { email, confidence: APOLLO_CONFIDENCE };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
