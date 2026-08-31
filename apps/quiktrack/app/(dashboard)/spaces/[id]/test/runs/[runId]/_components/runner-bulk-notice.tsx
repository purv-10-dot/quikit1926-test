"use client";

/**
 * Result banner after a runner bulk action (QUIKTR-341).
 *
 * A local sibling of `test/_components/bulk-notice.tsx` rather than the shared
 * one: that component's "View deleted" link is specific to soft-delete/restore,
 * which the runner grid's bulk actions don't have — none of Assign/Status/Label/
 * Remove-from-run leaves a "deleted" view to link back to.
 */
export function RunnerBulkNotice({
  notice,
  error,
  onDismiss,
}: {
  notice: string | null;
  error: string | null;
  onDismiss: () => void;
}) {
  if (!notice && !error) return null;

  return (
    <div
      className={`flex items-start gap-2 border-b px-4 py-2 text-xs ${
        error
          ? "border-red-100 bg-red-50 text-red-700"
          : "border-green-100 bg-green-50 text-green-800"
      }`}
    >
      <span className="min-w-0 flex-1">{error ?? notice}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-gray-400 hover:text-gray-600"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
