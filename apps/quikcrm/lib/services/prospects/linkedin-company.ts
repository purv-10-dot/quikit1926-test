/**
 * Normalizer for the LinkedIn extension's `companyData` blob.
 *
 * `CrmProspect.companyData` is untrusted, extension-owned JSON: its shape is
 * whatever the scraper produced at save time, across several versions. Parsing
 * it SERVER-SIDE (exactly as parseLinkedInPosts does for `posts`) means the
 * client only ever receives a typed, render-safe object and a malformed scrape
 * can never break the Prospects UI.
 *
 * Every field is optional — a prospect saved without visiting the company page
 * has no company data at all, which is valid.
 */

/** One company post captured from the company page. */
export interface LinkedInCompanyPost {
  text: string;
  date: string | null;
  reactions: number;
  comments: number;
  images: string[];
  videos: string[];
  postUrl: string;
}

/** The render-safe company record shown in the Prospects UI. */
export interface LinkedInCompany {
  name: string;
  tagline: string;
  about: string;
  industry: string;
  website: string;
  companySize: string;
  headquarters: string;
  founded: string;
  specialties: string;
  followers: string;
  employees: string;
  logo: string;
  banner: string;
  companyUrl: string;
  posts: LinkedInCompanyPost[];
  /** Which extraction layers contributed (voyager / json-ld / dom / meta). */
  source: string;
}

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === "string") {
    const n = Number.parseInt(v.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}

/** Only http(s) URLs — never `javascript:` or `data:` from an untrusted blob. */
function safeUrl(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "";
}

function urlList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const u = safeUrl(item);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

function parsePosts(v: unknown): LinkedInCompanyPost[] {
  if (!Array.isArray(v)) return [];
  const out: LinkedInCompanyPost[] = [];
  for (const raw of v.slice(0, 20)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const p = raw as Record<string, unknown>;
    const text = str(p.text);
    const images = urlList(p.images);
    const videos = urlList(p.videos);
    // A post with no text and no media has nothing to show.
    if (!text && images.length === 0 && videos.length === 0) continue;
    out.push({
      text,
      date: str(p.date) || null,
      reactions: num(p.reactions),
      comments: num(p.comments),
      images,
      videos,
      postUrl: safeUrl(p.postUrl),
    });
  }
  return out;
}

/**
 * Parse the stored blob into a typed record, or null when there is nothing
 * meaningful to show. Never throws.
 */
export function parseLinkedInCompany(raw: unknown): LinkedInCompany | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;

  const company: LinkedInCompany = {
    name: str(c.name),
    tagline: str(c.tagline),
    about: str(c.about),
    industry: str(c.industry),
    website: str(c.website),
    companySize: str(c.companySize),
    // `headquarters` is canonical; `location` is the scraper's legacy alias.
    headquarters: str(c.headquarters) || str(c.location),
    founded: str(c.founded),
    specialties: str(c.specialties),
    followers: str(c.followers),
    employees: str(c.employees),
    logo: safeUrl(c.logo),
    banner: safeUrl(c.banner),
    companyUrl: safeUrl(c.companyUrl),
    posts: parsePosts(c.posts),
    source: str(c.__source),
  };

  // Nothing worth opening a dialog for.
  const hasAnything =
    company.name ||
    company.about ||
    company.industry ||
    company.website ||
    company.headquarters ||
    company.companySize ||
    company.founded ||
    company.specialties ||
    company.followers ||
    company.employees ||
    company.posts.length > 0;

  return hasAnything ? company : null;
}
