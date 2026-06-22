"use client";

/**
 * Interactive gates for the OPSP export flows (KPI + Priority).
 *
 * Two awaitable modals, shared by both export drawers via `useExportGate()`:
 *
 *   1. Duplicate warning — when the AI similarity check flags one or more
 *      items as semantically similar to an EXISTING item (possibly owned by a
 *      different user). Offers Cancel · Skip · Replace.
 *
 *   2. Token-expired confirm — when the AI check could not run (all Gemini
 *      keys expired / quota exhausted). Shows a friendly message and lets the
 *      user export anyway. The AI NEVER blocks the user.
 *
 * Both `askDuplicates()` / `askTokenExpired()` return a Promise that resolves
 * when the user clicks a button, so callers can `await` the decision inside
 * their submit loop.
 */

import { useRef, useState, type ReactNode } from "react";

export type DuplicateDecision = "cancel" | "skip" | "replace";

export interface DuplicateInfo {
  /** The name the user typed for the item being exported. */
  attemptedName: string;
  /** The existing item it resembles. */
  existingName: string;
  /** Owner of the existing item (may be another user). */
  ownerName?: string | null;
  /** Short extra context, e.g. "Number · target 1000" or "weeks 1–13". */
  detail?: string | null;
}

interface DupState {
  entity: string;
  items: DuplicateInfo[];
}

export interface ExportGate {
  /** Resolve to the user's choice for the flagged duplicates. */
  askDuplicates: (entity: string, items: DuplicateInfo[]) => Promise<DuplicateDecision>;
  /** Resolve to `true` if the user wants to export despite the AI being down. */
  askTokenExpired: (entity: string) => Promise<boolean>;
  /** Render this in the drawer body so the modals can appear. */
  modals: ReactNode;
}

export function useExportGate(): ExportGate {
  const [dup, setDup] = useState<DupState | null>(null);
  const [token, setToken] = useState<{ entity: string } | null>(null);
  const dupResolve = useRef<((d: DuplicateDecision) => void) | null>(null);
  const tokenResolve = useRef<((proceed: boolean) => void) | null>(null);

  function askDuplicates(entity: string, items: DuplicateInfo[]) {
    return new Promise<DuplicateDecision>((resolve) => {
      dupResolve.current = resolve;
      setDup({ entity, items });
    });
  }
  function askTokenExpired(entity: string) {
    return new Promise<boolean>((resolve) => {
      tokenResolve.current = resolve;
      setToken({ entity });
    });
  }
  function decideDup(d: DuplicateDecision) {
    setDup(null);
    dupResolve.current?.(d);
    dupResolve.current = null;
  }
  function decideToken(proceed: boolean) {
    setToken(null);
    tokenResolve.current?.(proceed);
    tokenResolve.current = null;
  }

  const modals = (
    <>
      {dup && <DuplicateWarningModal state={dup} onDecide={decideDup} />}
      {token && <TokenExpiredModal entity={token.entity} onDecide={decideToken} />}
    </>
  );

  return { askDuplicates, askTokenExpired, modals };
}

/* ── overlay shell ─────────────────────────────────────────────────────── */

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">{children}</div>
    </div>
  );
}

/* ── duplicate warning (Cancel · Skip · Replace) ───────────────────────── */

function DuplicateWarningModal({
  state,
  onDecide,
}: {
  state: DupState;
  onDecide: (d: DuplicateDecision) => void;
}) {
  const n = state.items.length;
  const label = state.entity;
  return (
    <Overlay>
      <div className="px-5 pt-5">
        <h2 className="text-sm font-semibold text-gray-900">
          {n} similar {label}
          {n > 1 ? "s" : ""} already exist{n > 1 ? "" : "s"}
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Our AI check found {label.toLowerCase()}
          {n > 1 ? "s" : ""} that look like {n > 1 ? "ones" : "one"} already in the system — possibly
          owned by another user. Choose how to proceed.
        </p>
        <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto">
          {state.items.map((d, i) => (
            <li key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              <span className="font-semibold">“{d.attemptedName}”</span> looks like{" "}
              <span className="font-semibold">“{d.existingName}”</span>
              {d.ownerName ? <span className="text-amber-700"> · owned by {d.ownerName}</span> : null}
              {d.detail ? <span className="text-amber-700"> · {d.detail}</span> : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button
          type="button"
          onClick={() => onDecide("cancel")}
          className="rounded-lg border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onDecide("skip")}
          className="rounded-lg border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          title={`Skip the flagged ${label.toLowerCase()}s; create the rest`}
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => onDecide("replace")}
          className="rounded-lg bg-accent-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-700"
          title="Update the existing item with these values"
        >
          Replace
        </button>
      </div>
    </Overlay>
  );
}

/* ── token-expired fallback (never blocks) ─────────────────────────────── */

function TokenExpiredModal({
  entity,
  onDecide,
}: {
  entity: string;
  onDecide: (proceed: boolean) => void;
}) {
  return (
    <Overlay>
      <div className="px-5 pt-5">
        <h2 className="text-sm font-semibold text-gray-900">Duplicate check unavailable</h2>
        <p className="mt-2 text-xs text-gray-600">
          We are not able to identify if you have similar {entity.toLowerCase()}s right now. Do you
          still want to export?
        </p>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button
          type="button"
          onClick={() => onDecide(false)}
          className="rounded-lg border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onDecide(true)}
          className="rounded-lg bg-accent-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-700"
        >
          Export anyway
        </button>
      </div>
    </Overlay>
  );
}
