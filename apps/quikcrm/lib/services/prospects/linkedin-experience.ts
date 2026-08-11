/**
 * Normalizer for the LinkedIn extension's `experiences` blob.
 *
 * `CrmProspect.experiences` is untrusted, extension-owned JSON: its shape is
 * whatever the scraper produced at save time, across several versions. Parsing
 * it SERVER-SIDE (exactly as parseLinkedInPosts / parseLinkedInCompany do for
 * `posts` and `companyData`) means the client only ever receives a typed,
 * render-safe list and a malformed scrape can never break the Prospects UI.
 *
 * Every field is optional — a prospect whose profile had no Experience section,
 * or was saved by an older extension build, simply has no experience data.
 */

/** One position captured from the profile's Experience section. */
export interface LinkedInExperience {
  jobTitle: string;
  companyName: string;
  companyUrl: string;
  /** LinkedIn's own duration string, e.g. "Jan 2022 - Present · 2 yrs 3 mos". */
  duration: string;
  /** Composed range used only when `duration` is absent. */
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  current: boolean;
}

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** Only http(s) URLs — never `javascript:` or `data:` from an untrusted blob. */
function safeUrl(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "";
}

/**
 * Parse the stored blob into a typed list. Never throws; always returns an
 * array so callers need no null check.
 *
 * Capped at 50 positions: enough for any real career history, and a bound on
 * what a malformed or hostile blob can push into the page.
 */
export function parseLinkedInExperiences(raw: unknown): LinkedInExperience[] {
  if (!Array.isArray(raw)) return [];

  const out: LinkedInExperience[] = [];
  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const e = item as Record<string, unknown>;

    const jobTitle = str(e.jobTitle) || str(e.title);
    const companyName = str(e.companyName) || str(e.company);
    const description = str(e.description);
    const duration = str(e.duration) || str(e.companyDuration);
    const startDate = str(e.startDate);
    const endDate = str(e.endDate);
    const location = str(e.location);

    // A row with neither a title nor a company has nothing to display.
    if (!jobTitle && !companyName) continue;

    out.push({
      jobTitle,
      companyName,
      companyUrl: safeUrl(e.companyUrl),
      duration,
      startDate,
      endDate,
      location,
      description,
      current: e.current === true,
    });
  }
  return out;
}

/**
 * The date range to display for one position: LinkedIn's own duration string
 * when present, otherwise a composed "start – end" range.
 */
export function experienceRange(exp: LinkedInExperience): string {
  if (exp.duration) return exp.duration;
  const end = exp.current ? "Present" : exp.endDate;
  return [exp.startDate, end].filter(Boolean).join(" – ");
}
