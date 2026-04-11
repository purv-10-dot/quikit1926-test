/**
 * OPSP form-state normalization helpers.
 *
 * Extracted from `app/(dashboard)/opsp/page.tsx` so they can be unit-tested
 * in isolation (they were previously inline in the 2225-line page component,
 * blocking the refactor gate in code-analysis-full.md §6.2).
 *
 * The OPSP form persists as a single Prisma JSON row with many optional
 * fields that have evolved across redesigns. These helpers defensively map
 * legacy payload shapes onto the current FormData structure so the form
 * can round-trip data without crashing the dashboard.
 *
 * Fields handled today:
 *   - `keyInitiatives` — 5 rows of { desc, owner }
 *   - `rocks` — 5 rows of { desc, owner }
 *
 * Supported legacy shapes:
 *   1. HTML string (original RichEditor flow) → discard, use 5 empty rows
 *   2. string[] (numbered-rows flow)         → wrap each string as {desc, owner:""}
 *   3. { desc, owner }[] (current)           → pad / truncate to exactly 5 rows
 *   4. Malformed entries inside the array    → coerced to { desc:"", owner:"" }
 */

/** One row of a desc/owner list. */
export interface DescOwnerRow {
  desc: string;
  owner: string;
}

/** Exactly 5 empty desc/owner rows. */
export function emptyDescOwnerRows(): DescOwnerRow[] {
  return Array.from({ length: 5 }, () => ({ desc: "", owner: "" }));
}

/**
 * Normalize a field that stores 5 rows of { desc, owner }.
 *
 * Always returns exactly 5 rows. Never throws. Accepts any value — a
 * non-array, malformed rows, or legacy shapes all fall back to 5 empty
 * rows or coerced strings.
 */
export function normalizeDescOwnerRows(val: unknown): DescOwnerRow[] {
  if (!Array.isArray(val)) {
    return emptyDescOwnerRows();
  }
  const normalized: DescOwnerRow[] = (val as unknown[]).map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as { desc?: unknown; owner?: unknown };
      return {
        desc: typeof obj.desc === "string" ? obj.desc : "",
        owner: typeof obj.owner === "string" ? obj.owner : "",
      };
    }
    // Legacy string[] → wrap each string as {desc, owner:""}
    return { desc: typeof item === "string" ? item : "", owner: "" };
  });
  while (normalized.length < 5) normalized.push({ desc: "", owner: "" });
  return normalized.slice(0, 5);
}

/**
 * Normalize a loaded OPSP payload so form state always matches the current
 * FormData shape. Applies `normalizeDescOwnerRows` to the `keyInitiatives`
 * and `rocks` fields (both were previously HTML strings in the RichEditor
 * flow, now stored as { desc, owner }[] JSON arrays).
 *
 * Other fields are passed through untouched — add more normalizers here as
 * legacy shapes are discovered.
 *
 * Never mutates the input; returns a new object.
 */
export function normalizeLoadedOPSP(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  out.keyInitiatives = normalizeDescOwnerRows(out.keyInitiatives);
  out.rocks = normalizeDescOwnerRows(out.rocks);
  return out;
}
