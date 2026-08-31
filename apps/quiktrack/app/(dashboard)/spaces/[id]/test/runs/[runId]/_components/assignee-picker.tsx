"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, User, UserX } from "lucide-react";
import type { MemberOption as Member } from "../../../_components/use-project-members";

/**
 * Reassign a run-case (QUIKTR-317).
 *
 * A run-case's assignee is per-execution: the same test case can be owned by
 * different testers in different runs, which is why this writes
 * `QtTest.assigneeId` rather than the case's `ownerId`.
 */

/** Re-exported for existing importers; defined with the members hook. */
export type { MemberOption } from "../../../_components/use-project-members";

export function AssigneePicker({
  currentId,
  members,
  onChange,
  disabled,
}: {
  currentId: string | null;
  members: Member[];
  onChange: (userId: string | null) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click / Escape. Without this the menu stayed open until
  // something was chosen, which is what the screenshot shows.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = members.find((m) => m.userId === currentId);

  const pick = async (userId: string | null) => {
    setBusy(true);
    try {
      await onChange(userId);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        className="inline-flex w-full items-center justify-between gap-1 rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate">
            {current?.name ?? (
              <span className="text-gray-400">Unassigned</span>
            )}
          </span>
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {currentId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => pick(null)}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <UserX className="h-3.5 w-3.5 text-gray-400" />
              Unassign
            </button>
          )}
          {members.length === 0 && (
            // Only reachable for a genuinely empty project now. This used to show
            // on every project because the members hook mapped over the endpoint's
            // `{ members, pendingInvites }` OBJECT instead of `.members`, which
            // silently yielded an empty array.
            <p className="px-2 py-1.5 text-xs text-gray-400">
              Nobody has been added to this project yet.
            </p>
          )}
          {members.map((m) => (
            <button
              key={m.userId}
              type="button"
              disabled={busy || m.userId === currentId}
              onClick={() => pick(m.userId)}
              className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-gray-50 disabled:opacity-50 ${
                m.userId === currentId ? "font-medium text-blue-700" : "text-gray-700"
              }`}
            >
              <User className="h-3.5 w-3.5 text-gray-400" />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
