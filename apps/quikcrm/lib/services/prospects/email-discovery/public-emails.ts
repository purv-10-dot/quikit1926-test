/**
 * Learn a company's email pattern from addresses published on its own website.
 *
 * REPLACES THE SOURCE IMPLEMENTATION'S SEARCH-ENGINE SCRAPE. The original ran
 * `site:<domain> "@<domain>"` against google.com and duckduckgo.com and parsed
 * the result HTML. That approach is unusable here for two reasons: Google
 * blocks datacenter IPs (so on Vercel it silently returns nothing), and parsing
 * a search page's markup breaks whenever the markup changes.
 *
 * Fetching the company's own contact page instead is strictly better for this
 * purpose — it is the page most likely to publish real addresses, it needs no
 * API key or search quota, and it is a first-party source that cannot rate-limit
 * us for being a robot. The trade-off is narrower reach: addresses published
 * only on third-party pages are no longer found. Hunter and Apollo cover that.
 */

/** Paths most likely to publish addresses, in the order we try them. */
const CONTACT_PATHS = ["", "/contact", "/contact-us", "/about", "/team"];

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 400_000;

/** Mailbox names that belong to the company, not to a person. */
const ROLE_LOCALPARTS = new Set([
  "info",
  "contact",
  "hello",
  "hi",
  "sales",
  "support",
  "help",
  "admin",
  "office",
  "team",
  "careers",
  "jobs",
  "hr",
  "press",
  "media",
  "marketing",
  "billing",
  "accounts",
  "enquiries",
  "inquiries",
  "noreply",
  "no-reply",
  "donotreply",
  "webmaster",
  "postmaster",
  "privacy",
  "legal",
  "security",
  "abuse",
]);

/** Fetch a URL as text, with a hard timeout and a size cap. "" on any failure. */
async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; QuikCRM-EmailDiscovery/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return "";
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html")) return "";
    const body = await res.text();
    return body.slice(0, MAX_HTML_BYTES);
  } catch {
    // Timeout, DNS failure, TLS error, abort — all mean "no data", never fatal.
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** Every address at `domain` appearing in the text, lowercased and de-duped. */
export function extractEmailsFromText(text: string, domain: string): string[] {
  if (!text || !domain) return [];
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`[a-zA-Z0-9._%+-]+@${escaped}`, "gi");
  const matches = text.match(regex) || [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase())));
}

/**
 * Infer the company's pattern from a set of real addresses.
 *
 * Role accounts are excluded first: info@ and sales@ are always single-token
 * and would otherwise stack up votes for "firstname", which is exactly the
 * wrong conclusion at a company that actually uses first.last for people.
 * (This is a correctness fix over the source implementation, which counted
 * every address it found, role accounts included.)
 *
 * A separator is decisive evidence; a bare local-part is weak, so it needs two
 * independent examples before it can win. Returns "" when nothing clears the
 * bar, which leaves candidate ranking to the provider defaults.
 */
export function inferPublicPattern(emails: string[]): string {
  const personal = emails.filter((email) => {
    const local = (email.split("@")[0] || "").toLowerCase();
    return local && !ROLE_LOCALPARTS.has(local);
  });

  const scores = new Map<string, number>();
  const bump = (key: string, by: number) => scores.set(key, (scores.get(key) || 0) + by);

  for (const email of personal) {
    const local = email.split("@")[0] || "";
    if (local.includes(".")) bump("firstname.lastname", 2);
    else if (local.includes("_")) bump("firstname_lastname", 2);
    else if (/^[a-z]+$/.test(local) && local.length <= 10) bump("firstname", 1);
  }

  const winner = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0];
  return winner && winner[1] >= 2 ? winner[0] : "";
}

export interface PublicResearch {
  /** Personal-looking addresses found at the domain. */
  emails: string[];
  /** Pattern inferred from them, or "" when the evidence was too thin. */
  pattern: string;
}

/**
 * Scan the company's own site for published addresses.
 *
 * Pages are fetched sequentially and the scan stops at the first page yielding
 * two or more addresses — enough for `inferPublicPattern` to reach a verdict,
 * and a cheap way to avoid five requests when the homepage already answered.
 */
export async function researchPublicEmails(domain: string): Promise<PublicResearch> {
  if (!domain) return { emails: [], pattern: "" };

  const found = new Set<string>();
  for (const path of CONTACT_PATHS) {
    const html = await fetchText(`https://${domain}${path}`);
    if (html) {
      for (const email of extractEmailsFromText(html, domain)) found.add(email);
    }
    if (found.size >= 2) break;
  }

  const emails = Array.from(found);
  return { emails, pattern: inferPublicPattern(emails) };
}
