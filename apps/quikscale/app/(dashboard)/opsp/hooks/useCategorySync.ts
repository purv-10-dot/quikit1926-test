"use client";

/**
 * useCategorySync — the interactive state machine that gates a synchronized
 * category RENAME behind confirmation, for either cascade tier (Goals or
 * Actions). It is deliberately decoupled from the form's row shapes: the caller
 * (`useOPSPForm`) hands each request the callbacks that actually mutate the live
 * form, so this hook only orchestrates the modal flow.
 *
 * Flow (per the spec):
 *   detect rename → REPLACE modal
 *     ├─ Replace → onReplace(renames)                        → done
 *     └─ Cancel  → empty rows + new names available?
 *                    ├─ yes → APPEND modal
 *                    │          ├─ Yes → onAppendToEmpty(newNames) → done
 *                    │          └─ No  → (nothing)                 → done
 *                    └─ no  → notifyNoSlots()                      → done
 *
 * `reset()` drops any pending flow (used when the editor switches period or a
 * row is deleted, so a stale confirmation never applies to fresh data).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  appendableNewNames,
  appendPlacementRows,
  type CategoryRename,
} from "../lib/categorySync";
import type { SyncChange, SyncModalType } from "../components/SyncConfirmationModal";

export type SyncTier = "goals" | "actions";

/** Human labels for the downstream tier, used in the modal copy. */
const TIER_LABEL: Record<SyncTier, string> = {
  goals: "Goals (1 Year)",
  actions: "Actions (Quarter)",
};

export interface CategorySyncRequest {
  tier: SyncTier;
  /** The synchronized renames detected this cycle. */
  renames: CategoryRename[];
  /** Apply the confirmed replace to the live form (reflect at index + reset). */
  onReplace: (renames: CategoryRename[]) => void;
  /** Place the given new names downstream: fill empty rows, then grow up to max. */
  onAppendToEmpty: (newNames: string[]) => void;
  /** Latest destination categories — read at Cancel time (state may have moved). */
  getDestCats: () => string[];
  /** Row cap for this section (Goals/Actions = 10) — the append flow may grow new
   *  rows up to here before warning "no slots". */
  maxRows: number;
}

type Phase =
  | { kind: "replace"; req: CategorySyncRequest }
  | {
      kind: "append";
      req: CategorySyncRequest;
      newNames: string[];
      /** 1-based row numbers the names will land in (empty rows first, then grown). */
      targetRows: number[];
      /** Current downstream row count — a target row number above this is a NEW row. */
      rowCount: number;
    }
  | { kind: "warning"; title: string; message: string; names: string[] }
  | null;

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export interface CategorySyncModal {
  open: boolean;
  type: SyncModalType;
  title: string;
  message: string;
  changes: SyncChange[];
  confirmLabel: string;
  cancelLabel: string;
}

export interface UseCategorySyncResult {
  /** Descriptor to spread into <SyncConfirmationModal>. `open` is false when idle. */
  modal: CategorySyncModal;
  /** Whether a confirmation flow is currently in progress. */
  isPending: boolean;
  /** Enqueue a rename set for confirmation (no-op when `renames` is empty). */
  request: (req: CategorySyncRequest) => void;
  /** Show an acknowledge-only warning that categories already exist downstream
   *  (duplicate guard) — they were NOT added again. No-op when `names` empty. */
  warnDuplicates: (tier: SyncTier, names: string[]) => void;
  /** Confirm button. */
  confirm: () => void;
  /** Cancel button. */
  cancel: () => void;
  /** Drop any pending flow without applying (period switch / row delete). */
  reset: () => void;
}

const IDLE_MODAL: CategorySyncModal = {
  open: false,
  type: "replace",
  title: "",
  message: "",
  changes: [],
  confirmLabel: "Replace",
  cancelLabel: "Cancel",
};

export function useCategorySync(): UseCategorySyncResult {
  const [phase, setPhase] = useState<Phase>(null);
  // Mirror of `phase` for event handlers (confirm/cancel) so they read the live
  // value without stale closures and without an impure setState updater.
  const phaseRef = useRef<Phase>(null);
  phaseRef.current = phase;

  const request = useCallback((req: CategorySyncRequest) => {
    if (!req.renames || req.renames.length === 0) return;
    // Latest request wins (supersede any stale in-flight flow).
    setPhase({ kind: "replace", req });
  }, []);

  const warnDuplicates = useCallback((tier: SyncTier, names: string[]) => {
    if (names.length === 0) return;
    const label = TIER_LABEL[tier];
    const n = names.length;
    setPhase({
      kind: "warning",
      title: "Category Already Exists",
      message: `${plural(n, "This category", "These categories")} already exist${plural(
        n,
        "s",
        "",
      )} in ${label}, so ${plural(n, "it was", "they were")} not added again.`,
      names,
    });
  }, []);

  const reset = useCallback(() => setPhase(null), []);

  // Side effects (onReplace / onAppendToEmpty call setForm) must run OUTSIDE the
  // setPhase updater — an impure updater is double-invoked in React strict/dev,
  // firing the apply twice and leaving the modal open on the first click. We read
  // the live phase from a ref, run the effect, then setPhase() separately.
  const confirm = useCallback(() => {
    const cur = phaseRef.current;
    if (!cur) return;
    if (cur.kind === "replace") cur.req.onReplace(cur.req.renames);
    else if (cur.kind === "append") cur.req.onAppendToEmpty(cur.newNames);
    setPhase(null); // warning → OK just closes
  }, []);

  const cancel = useCallback(() => {
    const cur = phaseRef.current;
    if (!cur) return;
    if (cur.kind !== "replace") {
      setPhase(null); // append "No" / warning close → nothing
      return;
    }
    // Replace cancelled → offer to place the new names elsewhere: reuse empty rows
    // first, then grow new rows up to the section's max. Warn only when there's
    // genuinely no room (at the cap AND no empty rows).
    const destCats = cur.req.getDestCats();
    const candidates = appendableNewNames(cur.req.renames, destCats);
    const targetRows = appendPlacementRows(destCats, candidates.length, cur.req.maxRows);
    if (candidates.length > 0 && targetRows.length > 0) {
      setPhase({
        kind: "append",
        req: cur.req,
        newNames: candidates.slice(0, targetRows.length),
        targetRows,
        rowCount: destCats.length,
      });
      return;
    }
    // No room left (section is at its row cap with no empty rows).
    const label = TIER_LABEL[cur.req.tier];
    const n = candidates.length;
    setPhase({
      kind: "warning",
      title: "No Empty Category Slots",
      message: `${label} is full (${cur.req.maxRows} rows), so the updated categor${plural(
        n,
        "y was",
        "ies were",
      )} not synchronized. Clear a row in ${label} to sync ${plural(n, "it", "them")}.`,
      names: candidates,
    });
  }, []);

  const modal = useMemo<CategorySyncModal>(() => {
    if (!phase) return IDLE_MODAL;

    if (phase.kind === "replace") {
      const label = TIER_LABEL[phase.req.tier];
      return {
        open: true,
        type: "replace",
        title: "Replace Existing Categories?",
        message: `The following synchronized categories already exist in ${label}. Replacing them will overwrite the downstream categories. Do you want to continue?`,
        changes: phase.req.renames.map((r) => ({ oldName: r.oldName, newName: r.newName })),
        confirmLabel: "Replace",
        cancelLabel: "Cancel",
      };
    }

    if (phase.kind === "append") {
      const label = TIER_LABEL[phase.req.tier];
      const n = phase.newNames.length;
      // A target row number above the current count means a NEW row is added.
      const hasNew = phase.targetRows.some((r) => r > phase.rowCount);
      return {
        open: true,
        type: "append",
        title: "Add Updated Categories?",
        message:
          `Existing categories were not replaced. Add the updated categor${plural(n, "y", "ies")} ` +
          `to ${label}${hasNew ? " (a new row will be added)" : " in the empty rows"}?`,
        changes: phase.newNames.map((name, i) => {
          const rowNum = phase.targetRows[i];
          const isNew = rowNum > phase.rowCount;
          return { newName: `${name}  →  row ${rowNum}${isNew ? " (new)" : ""}` };
        }),
        confirmLabel: "Yes",
        cancelLabel: "No",
      };
    }

    // warning — self-contained display data (built by cancel()/warnDuplicates()).
    return {
      open: true,
      type: "warning",
      title: phase.title,
      message: phase.message,
      changes: phase.names.map((name) => ({ newName: name })),
      confirmLabel: "OK",
      cancelLabel: "Close",
    };
  }, [phase]);

  return { modal, isPending: phase != null, request, warnDuplicates, confirm, cancel, reset };
}
