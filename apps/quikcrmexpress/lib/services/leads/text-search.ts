/**
 * Toolbar / list quick-search — OR across the lead columns users expect to
 * query from the search box (parity with GET /api/leads?q=).
 */
export function buildLeadTextSearchWhere(term: string): Record<string, unknown> | null {
  const q = term.trim();
  if (!q) return null;
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q, mode: "insensitive" } },
      { jobTitle: { contains: q, mode: "insensitive" } },
      { ownerName: { contains: q, mode: "insensitive" } },
    ],
  };
}
