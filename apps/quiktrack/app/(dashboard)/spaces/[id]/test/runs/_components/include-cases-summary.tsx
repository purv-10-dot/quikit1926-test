"use client";

/**
 * "N selected [Select cases…]" — the compact summary + button that opens
 * `SelectCasesModal`, shared by New Run and Edit Run (QUIKTR-341). Both panels
 * used to render this inline; pulled out once Edit's version crossed the
 * 300-line ceiling in apps/quiktrack/CLAUDE.md.
 */
export function IncludeCasesSummary({
  count,
  onOpen,
  disabled,
}: {
  count: number;
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700">{count} selected</span>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Select cases…
      </button>
    </div>
  );
}
