/**
 * Company-domain resolution and MX inspection.
 *
 * A domain with no MX record cannot receive mail, so every candidate domain is
 * gated on an MX lookup before it is accepted. That single check is what stops
 * the slug guesses below from confidently returning a parked or unregistered
 * domain.
 *
 * DEPARTURE FROM THE SOURCE IMPLEMENTATION: the original resolved unknown
 * domains by scraping google.com/search HTML for result URLs. That is omitted
 * deliberately — Google blocks datacenter IPs, so on Vercel it returns nothing
 * while still costing a round trip, and the failure is silent. In its place we
 * lead with CrmProspect.companyWebsite, which the extension's company scraper
 * already captures and which is a first-party, higher-quality signal than
 * anything a search-result scrape produced.
 */
import dns from "dns";

const dnsPromises = dns.promises;

/** Registrable-suffix exceptions where the eTLD is two labels, not one. */
const COMMON_MULTI_TLDS = [
  "co.uk",
  "com.au",
  "com.br",
  "co.in",
  "co.nz",
  "co.za",
  "co.jp",
];

/**
 * Consumer mailbox providers and social hosts. A prospect's address at one of
 * these is a personal account, not a company domain, so they can never be the
 * resolved company domain — guessing patterns against gmail.com is nonsense.
 */
const NON_CORPORATE_DOMAINS = [
  "linkedin.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
];

/** Corporate suffixes stripped before slugifying a company name into a domain. */
const COMPANY_SUFFIX_RE =
  /\s*(inc|llc|ltd|limited|corp|corporation|plc|co|company|technologies|tech|solutions|group|global|services|systems|software|labs|pvt|private)\s*\.?$/i;

/** In-process MX cache. Best-effort only — a cold start simply re-resolves. */
const mxHostCache = new Map<string, string>();

/** Strip `www.` and reduce a hostname to its registrable domain. */
export function normalizeDomain(hostname: string): string {
  const lower = String(hostname || "")
    .toLowerCase()
    .trim()
    .replace(/^www\./, "");
  const parts = lower.split(".");
  if (parts.length <= 2) return lower;
  const lastTwo = parts.slice(-2).join(".");
  if (COMMON_MULTI_TLDS.includes(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

/**
 * Pull the registrable domain out of a URL.
 *
 * Tolerates the scheme-less values the LinkedIn scraper often produces
 * ("acme.com/about") by retrying with an https:// prefix.
 */
export function extractDomainFromUrl(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    try {
      return normalizeDomain(new URL(`https://${value}`).hostname);
    } catch {
      return "";
    }
  }
}

export function isLikelyCorporateDomain(domain: string): boolean {
  const lower = String(domain || "").toLowerCase();
  if (!lower || !lower.includes(".")) return false;
  return !NON_CORPORATE_DOMAINS.some(
    (blocked) => lower === blocked || lower.endsWith(`.${blocked}`),
  );
}

/**
 * Slug guesses for a company name, e.g. "Acme Tech Solutions" →
 * acme.com, acme.io, acme.co, acme.ai, acme-tech.com...
 *
 * Low-precision by nature; every result is MX-gated by the caller. Ordered
 * .com-first because that remains the overwhelming default for company mail.
 */
export function guessDomainsFromCompany(company: string): string[] {
  const cleaned = String(company || "")
    .toLowerCase()
    .replace(COMPANY_SUFFIX_RE, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();
  if (!cleaned) return [];

  const slug = cleaned.replace(/\s+/g, "");
  const hyphenated = cleaned.replace(/\s+/g, "-");

  return Array.from(
    new Set([
      `${slug}.com`,
      `${slug}.io`,
      `${slug}.co`,
      `${slug}.ai`,
      `${slug}.net`,
      `${hyphenated}.com`,
    ]),
  ).filter((d) => d.length > 4);
}

export async function hasMxRecord(domain: string): Promise<boolean> {
  if (!domain) return false;
  try {
    const records = await dnsPromises.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

/** Lowest-priority (i.e. primary) MX host for a domain, or "" if none. */
export async function getPrimaryMxHost(domain: string): Promise<string> {
  if (!domain) return "";
  const cached = mxHostCache.get(domain);
  if (cached !== undefined) return cached;

  try {
    const records = await dnsPromises.resolveMx(domain);
    const host =
      [...records].sort((a, b) => a.priority - b.priority)[0]?.exchange?.toLowerCase() || "";
    mxHostCache.set(domain, host);
    return host;
  } catch {
    mxHostCache.set(domain, "");
    return "";
  }
}

/**
 * Identify the mail provider behind an MX host.
 *
 * Used only to order candidate patterns. The source implementation also used
 * this to decide whether SMTP probing was safe (`risky`); that flag is gone
 * along with SMTP probing itself.
 */
export function getMailProvider(mxHost: string): string {
  const lower = String(mxHost || "").toLowerCase();
  if (!lower) return "unknown";
  if (/google|googlemail|aspmx/.test(lower)) return "google-workspace";
  if (/outlook|office365|mail\.protection|protection\.outlook/.test(lower)) return "microsoft-365";
  if (/mimecast/.test(lower)) return "mimecast";
  if (/proofpoint|pphosted/.test(lower)) return "proofpoint";
  if (/yahoodns|yahoomx/.test(lower)) return "yahoo";
  if (/zoho/.test(lower)) return "zoho";
  return lower;
}

/**
 * Resolve the company's mail domain, strongest hint first:
 *   1. companyWebsite scraped from the LinkedIn company page
 *   2. a non-LinkedIn URL sitting in the linkedinUrl field
 *   3. slug guesses from the company name
 *
 * Every tier is MX-gated, so a hint that looks right but cannot receive mail
 * falls through to the next rather than being returned. Returns "" when nothing
 * resolves, which the cascade reports as `domain_not_found`.
 */
export async function resolveDomain(input: {
  companyWebsite?: string | null;
  linkedinUrl?: string | null;
  companyName?: string | null;
}): Promise<string> {
  // 1. Scraped company website — first-party and by far the best signal.
  if (input.companyWebsite) {
    const d = extractDomainFromUrl(input.companyWebsite);
    if (d && isLikelyCorporateDomain(d) && (await hasMxRecord(d))) return d;
  }

  // 2. A company URL that ended up in the linkedinUrl field. Skipped when it is
  //    an actual LinkedIn URL, which carries no domain information.
  if (input.linkedinUrl) {
    const d = extractDomainFromUrl(input.linkedinUrl);
    if (d && isLikelyCorporateDomain(d) && (await hasMxRecord(d))) return d;
  }

  // 3. Slug guesses. Checked in parallel — these are independent DNS lookups and
  //    serialising six of them added seconds for no benefit. Order is preserved
  //    by indexing back into the guess list rather than racing.
  const guesses = guessDomainsFromCompany(input.companyName || "");
  if (guesses.length) {
    const results = await Promise.all(guesses.map((g) => hasMxRecord(g)));
    const hit = guesses.find((_, i) => results[i]);
    if (hit) return hit;
  }

  return "";
}
