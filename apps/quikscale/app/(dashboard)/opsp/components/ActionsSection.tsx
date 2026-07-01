"use client";

/**
 * ActionsSection — "ACTIONS (QTR) / Rocks / Critical #" + "THEME / Scoreboard / Celebration / Reward"
 *
 * Actions rows mirror Goals (1 YR.) for the overlapping rows — the cascade in
 * `hooks/useOPSPForm.ts` (Goals → Actions) auto-fills each Action row's
 * category from the matching Goal — but Actions can hold MORE rows than Goals:
 * the "+ Add New" button below adds independent rows up to MAX_ACTION_ROWS, and
 * the per-row remove control drops rows down to MIN_ACTION_ROWS. The cascade
 * grows Actions toward the Goals count but never shrinks below the user's rows,
 * so removing a Goal won't delete an extra Action row. The category field stays
 * editable per row. The fixed-height scroll viewport keeps the card height stable.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Plus, X } from "lucide-react";
import { Card, CardH } from "./Card";
import { FInput, FTextarea } from "./RichEditor";
import { CritBlock } from "./CritBlock";
import { CategorySelect, ProjectedInput } from "./category";
import { breakdownProjected, exceedsGoalProjected } from "./modals";
import { WithTooltip, OwnerSelect } from "./pickers";
import { MIN_ACTION_ROWS, MAX_ACTION_ROWS, type FormData } from "../hooks/useOPSPForm";
import type { PendingEdit } from "../lib/editLog";

interface Props {
  form: FormData;
  set: <K extends keyof FormData>(key: K, value: FormData[K], opts?: { skipLog?: boolean }) => void;
  /** Report the exact field the user edited (Projected/Category) for the change log. */
  logEdit?: (e: PendingEdit) => void;
  onExpandActions: () => void;
  onExpandRocks: () => void;
}

const emptyActionRow = () => ({ category: "", projected: "", m1: "", m2: "", m3: "" });

/**
 * Position the over-goal cap warning ABOVE the Projected input it belongs to.
 *
 * The edit-after-finalize "Change logged" overlay (EditNoteCard in page.tsx) is
 * rendered `fixed` and anchored just BELOW the same input, so a warning placed
 * inline beneath the input gets painted over. Anchoring it ABOVE — in viewport
 * (fixed) coordinates, escaping the Actions list's `overflow-y-auto` clip —
 * keeps the two from ever overlapping. Coordinates are clamped so the badge
 * stays fully on-screen; if there is no room above (input near the viewport
 * top) it sticks to the top edge rather than dropping into the overlay's band.
 */
export function computeCapWarningPosition(
  rect: { top: number; left: number },
  vw: number,
  badgeW = 220,
): { top: number; left: number } {
  const GAP = 6;
  const BADGE_H = 24;
  const top = Math.max(8, rect.top - BADGE_H - GAP);
  const left = Math.max(8, Math.min(rect.left, vw - badgeW - 8));
  return { top, left };
}

export function ActionsSection({
  form,
  set,
  logEdit,
  onExpandActions,
  onExpandRocks,
}: Props) {
  // Transient feedback when an over-goal Projected entry is rejected here on the
  // main grid (the expand modal has its own copy). Keyed by row index + the cap
  // value to show; cleared on a valid entry.
  const [capWarning, setCapWarning] = useState<{ row: number; max: string; top: number; left: number } | null>(null);

  // Keep the floating cap warning anchored to its Projected input as the page
  // scrolls/resizes, and auto-dismiss it after a few seconds so this transient
  // rejection feedback doesn't linger. Deps are the warning's identity (row +
  // max) only — NOT its top/left — so a reposition never resets the timer.
  useEffect(() => {
    if (!capWarning) return;
    const row = capWarning.row;
    const reanchor = () => {
      const cell = document.querySelector<HTMLElement>(
        `[data-opsp-field="actionsQtr.${row}"] [data-projected-cell]`,
      );
      const r = cell?.getBoundingClientRect();
      if (!r) {
        setCapWarning(null);
        return;
      }
      const pos = computeCapWarningPosition(r, window.innerWidth);
      setCapWarning((w) => (w && w.row === row ? { ...w, ...pos } : w));
    };
    window.addEventListener("scroll", reanchor, true);
    window.addEventListener("resize", reanchor);
    const timer = window.setTimeout(() => setCapWarning(null), 4000);
    return () => {
      window.removeEventListener("scroll", reanchor, true);
      window.removeEventListener("resize", reanchor);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capWarning?.row, capWarning?.max]);

  return (
    <>
      {/* Floating over-goal cap warning — anchored ABOVE the Projected input and
          portaled to <body> so it escapes the Actions list's overflow clip and
          the finalized-edit "Change logged" overlay (z-[60]) can't cover it. */}
      {capWarning && typeof document !== "undefined" &&
        createPortal(
          <div
            role="alert"
            className="fixed z-[70] pointer-events-none"
            style={{ top: capWarning.top, left: capWarning.left }}
          >
            <span className="inline-block rounded-md bg-red-600 px-2 py-1 text-[10px] font-semibold text-white shadow-lg ring-1 ring-red-700/20 whitespace-nowrap">
              Can&apos;t exceed Goal (1 YR): {capWarning.max}
            </span>
          </div>,
          document.body,
        )}
      {/* Actions QTR */}
      <Card className="space-y-4">
        <div>
          <CardH
            title="ACTIONS (QTR)"
            subtitle="(How)"
            expand
            onExpand={onExpandActions}
          />
          <div className="grid grid-cols-[1fr_auto] gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
            <div className="grid grid-cols-5 gap-1.5">
              <span className="col-span-3">Category</span>
              <span className="col-span-2 text-right">Projected</span>
            </div>
            <span className="w-5" />
          </div>
          {/* Fixed-height scroll viewport — the "+ Add New" button below (and
              the Goals cascade) can grow the list up to MAX_ACTION_ROWS; the
              card height stays stable and the user scrolls inside this region.
              Same value GoalsSection uses, so the two cards share a rhythm. */}
          <div className="max-h-[268px] overflow-y-auto pr-1">
            {form.actionsQtr.slice(0, MAX_ACTION_ROWS).map((row, i) => (
              <div
                key={i}
                data-opsp-field={`actionsQtr.${i}`}
                className="grid grid-cols-[1fr_auto] gap-1.5 items-start py-0.5 group"
              >
                <div className="grid grid-cols-5 gap-1.5 items-start">
                  <div className="col-span-3 min-w-0">
                    <CategorySelect
                      value={row.category}
                      excludeNames={form.actionsQtr.map((r, idx) => idx === i ? "" : r.category)}
                      onChange={(v) => {
                        // Changing category resets Projected to "", so any active
                        // over-goal warning on this row no longer applies.
                        setCapWarning((w) => (w?.row === i ? null : w));
                        logEdit?.({
                          field: `actionsQtr.${i}.category`,
                          label: `Actions (QTR) · ${row.category || "#" + (i + 1)} · Category`,
                          oldValue: row.category ?? "",
                          newValue: v,
                        });
                        const next = [...form.actionsQtr];
                        next[i] = {
                          ...next[i],
                          category: v,
                          projected: "",
                          m1: "",
                          m2: "",
                          m3: "",
                        };
                        set("actionsQtr", next, { skipLog: true });
                      }}
                    />
                  </div>
                  <div className="col-span-2 min-w-0" data-projected-cell>
                    <ProjectedInput
                      categoryName={row.category}
                      value={row.projected}
                      onChange={(v) => {
                        // Hard cap: a quarter's Projected may never exceed its
                        // annual Goal (1 YR) Projected. Reject the edit outright
                        // when the new value resolves above the goal so an
                        // over-goal value never enters form state (and therefore
                        // never autosaves). Same rule the ACTIONS (QTR) modal
                        // enforces — see exceedsGoalProjected in ./modals.
                        if (exceedsGoalProjected(row.category, v, form.goalRows)) {
                          // Surface the cap so the rejection isn't silent. Float
                          // the warning ABOVE this input — the "Change logged"
                          // overlay is anchored just below it (see
                          // computeCapWarningPosition).
                          const g = form.goalRows.find(
                            (gr) => gr.category.trim() && gr.category === row.category,
                          );
                          const cell = document.querySelector<HTMLElement>(
                            `[data-opsp-field="actionsQtr.${i}"] [data-projected-cell]`,
                          );
                          const r = cell?.getBoundingClientRect();
                          const pos = r
                            ? computeCapWarningPosition(r, window.innerWidth)
                            : { top: 8, left: 8 };
                          setCapWarning({ row: i, max: g?.projected?.trim() || "", ...pos });
                          return;
                        }
                        // Valid entry — clear any stale cap warning on this row.
                        setCapWarning((w) => (w?.row === i ? null : w));
                        logEdit?.({
                          field: `actionsQtr.${i}.projected`,
                          label: `Actions (QTR) · ${row.category || "#" + (i + 1)} · Projected`,
                          oldValue: row.projected ?? "",
                          newValue: v,
                        });
                        const next = [...form.actionsQtr];
                        // Automatic categories: auto-fill m1..m3.
                        // Manual categories: breakdownProjected returns null →
                        // leave the month cells alone (user fills via modal).
                        const autofill = breakdownProjected(row.category, v, 3, {
                          force: true,
                        });
                        const mPatch = autofill
                          ? {
                              m1: autofill[0] ?? "",
                              m2: autofill[1] ?? "",
                              m3: autofill[2] ?? "",
                            }
                          : {};
                        next[i] = { ...next[i], projected: v, ...mPatch };
                        set("actionsQtr", next, { skipLog: true });
                      }}
                    />
                    {/* Over-goal rejection feedback renders as a floating badge
                        anchored ABOVE this input (portaled to <body>) — see the
                        capWarning block at the top of the component. Inline-below
                        rendering was covered by the "Change logged" overlay. */}
                  </div>
                </div>
                {form.actionsQtr.length > MIN_ACTION_ROWS ? (
                  <button
                    type="button"
                    aria-label="Remove row"
                    onClick={() => {
                      const next = [...form.actionsQtr];
                      next.splice(i, 1);
                      set("actionsQtr", next);
                    }}
                    className="w-5 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="w-5" />
                )}
              </div>
            ))}
          </div>
          {form.actionsQtr.length < MAX_ACTION_ROWS && (
            <button
              type="button"
              onClick={() => set("actionsQtr", [...form.actionsQtr, emptyActionRow()])}
              className="mt-2 inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              Add New
            </button>
          )}
        </div>
        {/* Rocks — 3-column table (rank | Quarterly Priority | Who/OwnerSelect). Matches Key Thrusts/Capabilities pattern. */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-xs font-bold text-gray-800 uppercase">Rocks</p>
              <p className="text-xs text-gray-500">
                Quarterly Priorities
                {form.rocks.filter((r) => r.desc.trim() && !r.owner).length > 0 && (
                  <span className="text-red-600 font-medium ml-1">
                    ({form.rocks.filter((r) => r.desc.trim() && !r.owner).length} missing owner)
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onExpandRocks}
              data-expand="true"
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium pb-1 border-b border-gray-100 mb-1">
            <span className="w-5 flex-shrink-0">#</span>
            <span className="flex-1">Quarterly Priorities</span>
            <span className="w-[95px] flex-shrink-0">Who</span>
          </div>
          <div className="divide-y divide-gray-100">
            {form.rocks.map((row, i) => (
              <div key={i} data-opsp-field={`rocks.${i}`} className="flex items-center gap-1.5 py-1.5">
                <span className="text-xs text-gray-400 w-5 flex-shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <WithTooltip
                  content={row.desc}
                  className="relative flex-1 min-w-0"
                >
                  <FInput
                    value={row.desc}
                    placeholder="Quarterly Priority"
                    maxLength={75}
                    onChange={(v) => {
                      const next = [...form.rocks];
                      next[i] = { ...next[i], desc: v };
                      set("rocks", next);
                    }}
                  />
                </WithTooltip>
                <div className="relative w-[95px] flex-shrink-0">
                  <OwnerSelect
                    value={row.owner}
                    onChange={(v) => {
                      const next = [...form.rocks];
                      next[i] = { ...next[i], owner: v };
                      set("rocks", next);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-gray-100 pt-3 space-y-3">
          <CritBlock
            label="Critical #"
            value={form.criticalNumProcess}
            onChange={(v) => set("criticalNumProcess", v)}
          />
          <CritBlock
            label="Balancing Critical #"
            value={form.balancingCritNumProcess}
            onChange={(v) => set("balancingCritNumProcess", v)}
          />
        </div>
      </Card>

      {/* Theme — equal split between all 4 sections */}
      <Card className="flex flex-col gap-0 p-0 overflow-hidden">
        <div className="flex-1 flex flex-col p-4">
          <p className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-1">
            THEME
          </p>
          <p className="text-xs text-gray-500 mb-2">(QTR/ANNUAL)</p>
          <FTextarea
            value={form.theme}
            onChange={(v) => set("theme", v)}
            rows={4}
            className="flex-1 min-h-[60px]"
            maxLength={750}
          />
        </div>
        <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-800 uppercase mb-0.5">
            Scoreboard Design
          </p>
          <p className="text-xs text-gray-500 mb-2">
            Describe and/or sketch your design in this space
          </p>
          <FTextarea
            value={form.scoreboardDesign}
            onChange={(v) => set("scoreboardDesign", v)}
            rows={3}
            className="flex-1 min-h-[60px]"
            maxLength={800}
          />
        </div>
        <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-800 uppercase mb-2">
            Celebration
          </p>
          <FTextarea
            value={form.celebration}
            onChange={(v) => set("celebration", v)}
            rows={3}
            className="flex-1 min-h-[60px]"
            maxLength={400}
          />
        </div>
        <div className="flex-1 flex flex-col p-4 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-800 uppercase mb-2">
            Reward
          </p>
          <FTextarea
            value={form.reward}
            onChange={(v) => set("reward", v)}
            rows={3}
            className="flex-1 min-h-[60px]"
            maxLength={400}
          />
        </div>
      </Card>
    </>
  );
}

export type ActionsSectionProps = Props;
