/**
 * Route-segment loading fallback for the dashboard group.
 *
 * Shown while a server component in this segment is streaming. Matches
 * apps/quikscale/app/(dashboard)/loading.tsx and apps/quikinfra's equivalent;
 * root CLAUDE.md lists loading.tsx among the canonical route files.
 */
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-accent-600"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
