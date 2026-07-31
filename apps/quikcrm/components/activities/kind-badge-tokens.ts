// Soft per-type badge tokens for the "Linked To" kind label. Follows the
// design-system badge pattern (bg-*-50 / text-*-700 / ring-*-200) used by
// sourceBadgeClass and the activity-timeline type colours — subtle, accessible,
// low-saturation. Hardcoded (not accent-*) because they encode record type, not
// brand — see CLAUDE.md. Unknown kinds fall back to the neutral slate badge.
//
// Extracted from activities-list-client.tsx so the table cell and the
// "Linked To" summary row above it share one palette and cannot drift.
export const KIND_BADGE: Record<string, string> = {
  Lead: "bg-blue-50 text-blue-700 ring-blue-200",
  Account: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Contact: "bg-violet-50 text-violet-700 ring-violet-200",
  Opportunity: "bg-amber-50 text-amber-800 ring-amber-200",
};

export const KIND_BADGE_FALLBACK = "bg-slate-50 text-slate-600 ring-slate-200";
