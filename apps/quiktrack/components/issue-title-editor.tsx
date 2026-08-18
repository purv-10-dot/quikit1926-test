"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

/**
 * Inline title editor with explicit ✓ / ✕ buttons, matching Jira.
 *
 * Shared by the full page and the edit drawer so the two cannot drift.
 *
 * The subtle part is BLUR vs CLICK. A naive `onBlur={commit}` fires before a click on
 * the ✕ lands, so cancelling would save the very edit you were discarding. Two guards:
 *
 *  1. `onMouseDown` + `preventDefault()` on both buttons — the input never loses focus,
 *     so blur never fires for those clicks.
 *  2. A `cancelRef` flag, so if blur does win a race it knows to discard.
 *
 * Blur elsewhere still SAVES (click-away-to-save is what the drawer already did, and
 * losing a rename because you clicked the page is worse than an accidental save you can
 * undo by renaming again).
 */
export function IssueTitleEditor({
  value,
  onSave,
  canUpdate,
  className = "text-2xl font-semibold leading-tight",
}: {
  value: string;
  onSave: (next: string) => void;
  canUpdate: boolean;
  /** Typography, so the drawer and the page can differ in size. */
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelRef = useRef(false);

  // Re-sync when the issue changes underneath (navigation, or a refetch landing).
  useEffect(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    setEditing(false);
    const next = draft.trim();
    // Empty is not a valid title, and an unchanged one is not worth a request.
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  const cancel = () => {
    cancelRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <h1
        onClick={() => canUpdate && setEditing(true)}
        className={`rounded px-2 py-1 -ml-2 text-gray-900 ${className} ${
          canUpdate ? "cursor-text hover:bg-gray-50" : "cursor-default"
        }`}
        title={canUpdate ? "Click to edit" : undefined}
      >
        {value}
      </h1>
    );
  }

  return (
    <div className="-ml-2">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label="Work item title"
        className={`w-full rounded border-2 border-blue-500 px-2 py-1 text-gray-900 focus:outline-none ${className}`}
      />
      <div className="mt-1.5 flex items-center gap-1.5 px-2">
        <button
          type="button"
          // mouseDown + preventDefault keeps focus on the input, so `onBlur` never
          // fires for this click and the two handlers cannot both run.
          onMouseDown={(e) => {
            e.preventDefault();
            commit();
          }}
          aria-label="Save title"
          title="Save"
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            cancel();
          }}
          aria-label="Cancel"
          title="Cancel"
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
