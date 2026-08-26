"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock, X } from "lucide-react";
import { PopoverPanel } from "../../grouped-kanban/_components/cells/popover-panel";
import {
  dayKeyFromToday,
  dueDateInputToISO,
  dueDateTone,
  formatDueDateLabel,
  toDueDateInput,
  type DueDateTone,
} from "@/lib/utils/due-date";

/** Chip styling per state — overdue and due-today are semantic, not themeable. */
const TONE_CLASS: Record<DueDateTone, string> = {
  overdue: "border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
  today: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  upcoming: "border-gray-200 bg-white text-gray-600 hover:bg-gray-100",
};

const QUICK_PICKS: Array<{ label: string; offset: number }> = [
  { label: "Today", offset: 0 },
  { label: "Tomorrow", offset: 1 },
  { label: "Next week", offset: 7 },
];

interface Props {
  /** Stored due date (UTC-midnight ISO) or null. */
  dueDate: string | null;
  /** Called with a UTC-midnight ISO string, or null to clear. */
  onChange: (iso: string | null) => void;
  /** Key of the row, for the accessible label. */
  issueKey: string;
}

/**
 * Inline due-date chip for a backlog row (Jira parity): shows the date, turns
 * red once it's past and amber on the day itself, and opens a small picker on
 * click so a date can be set without opening the work item.
 *
 * Rows with no due date show a faint calendar affordance that only becomes
 * solid on row hover — same treatment as the "+ Epic" pill and the story-point
 * badge, so an empty backlog doesn't turn into a wall of placeholders.
 */
export function DueDateCell({ dueDate, onChange, issueKey }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => toDueDateInput(dueDate));
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Re-seed the picker whenever the row's value changes underneath us (another
  // user's edit arriving on refetch, or a bulk edit) so reopening it doesn't
  // show a stale day.
  useEffect(() => {
    setDraft(toDueDateInput(dueDate));
  }, [dueDate]);

  const tone = dueDateTone(dueDate);
  const label = formatDueDateLabel(dueDate);

  function commit(next: string) {
    setDraft(next);
    setOpen(false);
    // No-op when the day didn't actually change — avoids a pointless PATCH and
    // a spurious "changed due date" history entry.
    if (next === toDueDateInput(dueDate)) return;
    onChange(dueDateInputToISO(next));
  }

  function onInput(next: string) {
    setDraft(next);
    // A native date input reports "" while the value is half-typed (day filled
    // in but not the year yet). Committing that would clear the date and close
    // the picker mid-entry, so only a complete day commits.
    if (/^\d{4}-\d{2}-\d{2}$/.test(next)) commit(next);
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={
          tone === null
            ? "Set due date"
            : tone === "overdue"
              ? `Overdue — was due ${label}`
              : tone === "today"
                ? `Due today (${label})`
                : `Due ${label}`
        }
        aria-label={tone === null ? `Set due date for ${issueKey}` : `Due date ${label}, edit`}
        className={
          tone === null
            ? "inline-flex h-5 shrink-0 items-center gap-1 rounded border border-dashed border-gray-300 bg-white px-1.5 text-[10px] font-medium text-gray-500 opacity-40 transition-opacity hover:border-blue-400 hover:text-blue-600 hover:opacity-100 group-hover:opacity-100"
            : `inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[10px] font-medium ${TONE_CLASS[tone]}`
        }
      >
        {tone === "overdue" ? (
          <Clock className="h-3 w-3" />
        ) : (
          <CalendarDays className="h-3 w-3" />
        )}
        {label || "Due"}
      </button>

      <PopoverPanel
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        width={216}
        placement="auto"
        estimatedHeight={200}
      >
        <div className="px-2.5 pb-2 pt-1.5">
          <div className="mb-1.5 text-[11px] font-semibold text-gray-700">Due date</div>
          <input
            autoFocus
            type="date"
            value={draft}
            onChange={(e) => onInput(e.target.value)}
            className="h-7 w-full rounded border border-gray-300 px-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-label="Due date"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {QUICK_PICKS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => commit(dayKeyFromToday(q.offset))}
                className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
              >
                {q.label}
              </button>
            ))}
          </div>
          {dueDate && (
            <button
              type="button"
              onClick={() => commit("")}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline"
            >
              <X className="h-3 w-3" /> Clear due date
            </button>
          )}
        </div>
      </PopoverPanel>
    </>
  );
}
