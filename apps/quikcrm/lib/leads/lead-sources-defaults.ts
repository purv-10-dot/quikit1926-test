/** Default lead source dropdown values (seeded when tenant has none). Client-safe — no Prisma. */
export const DEFAULT_LEAD_SOURCES = [
  "Marketing Lead",
  "Upwork",
  "Freelancer",
  "LinkedIn",
  "Email Hunt",
  "Cold Calling",
  "Direct Reachout",
  "Website Inquiry",
  "Referral",
  "Existing Client Reference",
] as const;

export type DefaultLeadSource = (typeof DEFAULT_LEAD_SOURCES)[number];

/** Client-side fallback options when the API returns an empty list. */
export function defaultLeadSourceOptions(): { id: string; name: string }[] {
  return DEFAULT_LEAD_SOURCES.map((name, index) => ({
    id: `default-source-${index}`,
    name,
  }));
}
