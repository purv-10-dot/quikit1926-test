"use client";

import { useState } from "react";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import type { ActorChangeGroup, HistoryScope } from "@/lib/utils/opspEditHighlight";

/**
 * Post-finalize "what changed" banner for the OPSP form.
 *
 * Collapsed (default) it reads exactly like the old single-line notice — who
 * made the most recent change + one "Open History" (everything). Expanded, it
 * becomes a per-user stepper: one row per editor, newest first, each with its
 * own timestamp and an "Open History" scoped CUMULATIVELY up to that user's
 * latest edit (so a later editor's row shows their edits plus the earlier ones
 * they built on).
 *
 * Purely presentational — the host page owns the data + acknowledgement; this
 * component only renders and reports which scope the viewer wants to open.
 */
export function PostFinalizeChangesBanner({
  groups,
  latestActorName,
  hasUnacknowledged,
  onOpenHistory,
}: {
  /** Per-user change groups, newest editor first (see `groupEditsByActor`). */
  groups: ActorChangeGroup[];
  /** Name shown in the collapsed headline (the most recent editor). */
  latestActorName?: string;
  /** When true, use the amber "needs review" emphasis; else a calmer neutral tone. */
  hasUnacknowledged: boolean;
  /** Open the history drawer. No scope = everything; a scope = cumulative up to that user. */
  onOpenHistory: (scope?: HistoryScope) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (groups.length === 0) return null;

  const multiUser = groups.length > 1;
  const tone = hasUnacknowledged
    ? {
        wrap: "bg-amber-50/70 border-amber-200",
        chip: "bg-amber-100 text-amber-600",
        title: "text-amber-800",
        sub: "text-amber-600",
        btn: "border-amber-300 text-amber-700 hover:bg-amber-50",
      }
    : {
        wrap: "bg-gray-50 border-gray-200",
        chip: "bg-gray-100 text-gray-500",
        title: "text-gray-800",
        sub: "text-gray-500",
        btn: "border-gray-300 text-gray-600 hover:bg-gray-50",
      };

  return (
    <div className={`mx-6 mt-3 rounded-xl border ${tone.wrap}`}>
      {/* ── Collapsed headline (always visible) ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${tone.chip}`}>
            <History className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${tone.title}`}>
              {latestActorName
                ? `${latestActorName} updated the OPSP after it was finalized.`
                : "Updated the OPSP after it was finalized."}
            </p>
            <p className={`text-xs ${tone.sub}`}>
              The changed fields are highlighted below — open History to review them.
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenHistory()}
            className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold ${tone.btn}`}
          >
            <History className="h-3.5 w-3.5" /> Open History
          </button>
          {multiUser && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "Hide per-user changes" : "Show per-user changes"}
              className={`inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1.5 text-xs font-semibold ${tone.btn}`}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {groups.length} {groups.length === 1 ? "editor" : "editors"}
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded per-user stepper ── */}
      {expanded && multiUser && (
        <ul className="border-t border-current/10 px-4 py-2 space-y-1">
          {groups.map((g, i) => (
            <li
              key={g.actorId || g.actorName}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/60"
            >
              {/* Timeline rail: filled dot for the newest, ring for older. */}
              <span className="relative flex flex-shrink-0 justify-center" aria-hidden>
                <span
                  className={
                    i === 0
                      ? "h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200"
                      : "h-2.5 w-2.5 rounded-full border-2 border-gray-300 bg-white"
                  }
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${tone.title}`}>{g.actorName}</p>
                <p className={`text-xs ${tone.sub}`}>
                  <time dateTime={new Date(g.latestTs).toISOString()} title={fmtAbsolute(g.latestTs)}>
                    {fmtRelative(g.latestTs)}
                  </time>
                  {" · "}
                  {g.fieldCount} {g.fieldCount === 1 ? "field" : "fields"}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenHistory({ actorId: g.actorId, actorName: g.actorName, untilTs: g.latestTs })
                }
                className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 text-[11px] font-semibold ${tone.btn}`}
              >
                <History className="h-3 w-3" /> Open History
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtAbsolute(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "just now" / "5m ago" / "2h ago" / "3d ago" / falls back to a date. */
function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return fmtAbsolute(ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return fmtAbsolute(ts);
}
