/**
 * Machinery & Equipment list queries always refetch from the API (PostgreSQL).
 * React Query memory is a short-lived view cache only — never the source of truth.
 */
export const equipmentQueryOptions = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
};
