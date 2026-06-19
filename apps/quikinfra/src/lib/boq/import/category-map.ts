/**
 * Category resolution for BOQ sheets.
 *
 * Both adapters need to map a raw sheet name → a canonical category that
 * downstream modules (DPR, RAB, PR, MR) filter by. The mapping is forgiving:
 * common variants (case, underscores, trailing commas) all collapse to the
 * same canonical label.
 *
 * Unknown sheet names are NOT silently dropped — they're returned with
 * `matched: false` so the caller can either skip them, surface a warning,
 * or pass through the raw name as a free-form category.
 */

export const CANONICAL_CATEGORIES = {
  CIVIL: "Civil Building",
  ELECTRICAL: "Electrical",
  ROAD: "Road Works",
} as const;

export type CanonicalCategory = typeof CANONICAL_CATEGORIES[keyof typeof CANONICAL_CATEGORIES];

/** Sheet names that should be ignored entirely (not parsed at all). */
const IGNORE_SHEET_PATTERNS = [
  /^instructions?$/i,
  /^quick[\s_-]*reference$/i,
  /^summary$/i,
  /^notes?$/i,
  /^cover$/i,
  /^index$/i,
  /^toc$/i,
];

export function shouldIgnoreSheet(sheetName: string): boolean {
  const norm = sheetName.trim();
  return IGNORE_SHEET_PATTERNS.some((re) => re.test(norm));
}

/**
 * Normalise a sheet name for matching: lowercase, strip punctuation/spaces.
 * "Civil_Building" → "civilbuilding"; "Ele," → "ele"; "Road Works" → "roadworks".
 */
function normaliseKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CIVIL_KEYS = new Set([
  "civil",
  "civilbuilding",
  "building",
  "civilworks",
  "buildingworks",
  "structural",
]);

const ELECTRICAL_KEYS = new Set([
  "ele",
  "elec",
  "electric",
  "electrical",
  "electricalworks",
  "elewks",
]);

const ROAD_KEYS = new Set([
  "road",
  "roads",
  "roadworks",
  "roadwork",
  "highway",
  "highways",
  "pavement",
  "pavements",
]);

export interface CategoryMatch {
  canonical: string;
  matched: boolean;       // true = matched a known bucket; false = passthrough
  source: string;         // raw sheet name
}

/**
 * Resolve a sheet name to its canonical category.
 *
 * If the sheet matches one of the three known buckets we return the
 * canonical label. Otherwise we return the trimmed raw name with
 * `matched=false` so the pipeline can warn but still ingest the data —
 * imported BOQs from new disciplines (e.g. HVAC, Plumbing) shouldn't
 * be silently dropped.
 */
export function resolveCategory(sheetName: string): CategoryMatch {
  const raw = (sheetName ?? "").trim();
  const key = normaliseKey(raw);

  if (CIVIL_KEYS.has(key) || key.startsWith("civil") || key.startsWith("building")) {
    return { canonical: CANONICAL_CATEGORIES.CIVIL, matched: true, source: raw };
  }
  if (ELECTRICAL_KEYS.has(key) || key.startsWith("electric") || key.startsWith("ele")) {
    return { canonical: CANONICAL_CATEGORIES.ELECTRICAL, matched: true, source: raw };
  }
  if (ROAD_KEYS.has(key) || key.startsWith("road") || key.startsWith("highway")) {
    return { canonical: CANONICAL_CATEGORIES.ROAD, matched: true, source: raw };
  }

  // Fall through: keep the trimmed raw name so the user sees something
  // meaningful in the BOQ tree. Pipeline will emit an info-level warning.
  return { canonical: raw || "Uncategorised", matched: false, source: raw };
}
