"use client";

/**
 * Result banner after a bulk delete or restore.
 *
 * Split from `repository-view.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once selection landed.
 *
 * The "View deleted" link matters more than it looks: a soft delete with no route
 * back is indistinguishable from a permanent one from the user's side. This is the
 * undo path.
 */
export function BulkNotice({
  notice,
  error,
  showingDeleted,
  onViewDeleted,
  onDismiss,
}: {
  notice: string | null;
  error: string | null;
  /** Hide the "View deleted" link when already in that view. */
  showingDeleted: boolean;
  onViewDeleted: () => void;
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

      {!error && !showingDeleted && (
        <button
          type="button"
          onClick={onViewDeleted}
          className="shrink-0 font-medium underline hover:no-underline"
        >
          View deleted
        </button>
      )}

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
