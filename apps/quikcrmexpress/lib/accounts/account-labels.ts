/** Preset account labels for filtering and command palette. */
export const ACCOUNT_LABEL_PRESETS = [
  "VIP",
  "High Risk",
  "Enterprise",
  "Partner",
  "Renewal Risk",
] as const;

export type AccountLabelPreset = (typeof ACCOUNT_LABEL_PRESETS)[number];

export function normalizeAccountTags(tags: string[] | null | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function tagBadgeClass(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("vip")) return "bg-violet-100 text-violet-800 ring-violet-200";
  if (l.includes("risk")) return "bg-rose-100 text-rose-800 ring-rose-200";
  if (l.includes("partner")) return "bg-sky-100 text-sky-800 ring-sky-200";
  if (l.includes("enterprise")) return "bg-indigo-100 text-indigo-800 ring-indigo-200";
  if (l.includes("renewal")) return "bg-amber-100 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}
