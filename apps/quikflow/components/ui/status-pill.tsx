import { cn } from "@/lib/utils";

/**
 * Status pill for workflow/run/approval states. Uses fixed semantic colors
 * (green/amber/red/blue/gray) — these represent data states, not brand, so
 * they are intentionally NOT accent-themed (see root CLAUDE.md).
 */
const STYLES: Record<string, string> = {
  // workflow
  Active: "bg-green-100 text-green-700",
  Live: "bg-green-100 text-green-700",
  Paused: "bg-gray-100 text-gray-600",
  Draft: "bg-blue-100 text-blue-700",
  Archived: "bg-gray-100 text-gray-500",
  Error: "bg-red-100 text-red-700",
  // run
  success: "bg-green-100 text-green-700",
  running: "bg-blue-100 text-blue-700",
  waiting: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  // approval
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  // connection
  connected: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
};

/**
 * Statuses whose stored value is not what a reader needs to see. A connection
 * goes to `error` when the identity provider rejects the stored grant — the
 * only useful thing to say about it is the action it needs, not the category
 * it fell into.
 */
const LABELS: Record<string, string> = {
  error: "reconnect required",
};

const DOT: Record<string, string> = {
  Active: "bg-green-500",
  Live: "bg-green-500",
  success: "bg-green-500",
  connected: "bg-green-500",
  approved: "bg-green-500",
  Paused: "bg-gray-400",
  cancelled: "bg-gray-400",
  Archived: "bg-gray-400",
  Draft: "bg-blue-500",
  running: "bg-blue-500",
  waiting: "bg-amber-500",
  pending: "bg-amber-500",
  Error: "bg-red-500",
  failed: "bg-red-500",
  rejected: "bg-red-500",
  expired: "bg-red-500",
  error: "bg-red-500",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        STYLES[status] ?? "bg-gray-100 text-gray-600",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[status] ?? "bg-gray-400")} />
      {label ?? LABELS[status] ?? status}
    </span>
  );
}
