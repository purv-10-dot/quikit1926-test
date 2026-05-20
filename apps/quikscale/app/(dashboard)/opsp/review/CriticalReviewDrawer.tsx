"use client";

/**
 * CriticalReviewDrawer — right-side slide-in panel that edits ONE Critical
 * card. The four projected thresholds (Super Green / Light Green / Yellow /
 * Red) are shown read-only; the user enters a single Achieved value and a
 * single Comment, and the tier is derived live via `resolveCritTier()`.
 *
 * Fields (top → bottom):
 *   - Critical Title (read-only display)
 *   - 4 × Projected     (read-only, labeled by tier)
 *   - Achieved          (single numeric input)
 *   - Status            (live tier badge, computed from Achieved)
 *   - Comments          (single textarea)
 *
 * Save Changes → parent persists via POST /api/opsp/review/critical.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@quikit/ui";
import { cn } from "@/lib/utils";
import { CRIT_BULLET_COLORS, CRIT_BULLET_LABELS } from "./helpers";
import {
  resolveCritTier,
  critTierCellClasses,
  CRIT_TIER_LABELS,
  CRIT_TIER_DOT_HEX,
  toNum,
} from "@/lib/utils/opspHelpers";
import type { CriticalTableEntry } from "./CriticalTable";

export interface CriticalReviewDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header title: "Critical # — Growth" / "Balancing Critical # — Stability" */
  heading: string;
  /** The CritCard payload (title + 4 bullets) the drawer is editing. */
  card: { title: string; bullets: string[] };
  /** Saved entry for this card (single — no per-bullet rows). */
  entry: CriticalTableEntry | null;
  /** Disables inputs (OPSP draft / reviewed). */
  readOnly?: boolean;
  /** Called on Save with the new patch (only if something actually changed). */
  onSave: (patch: CriticalTableEntry) => Promise<void> | void;
  saving?: boolean;
}

export function CriticalReviewDrawer({
  open,
  onClose,
  heading,
  card,
  entry,
  readOnly = false,
  onSave,
  saving = false,
}: CriticalReviewDrawerProps) {
  // Local working copy — committed only on Save Changes.
  const [local, setLocal] = useState<CriticalTableEntry>({
    achievedValue: null,
    comment: null,
  });

  // Reset local state every time the drawer opens with a (possibly new) card.
  useEffect(() => {
    if (!open) return;
    setLocal({
      achievedValue: entry?.achievedValue ?? null,
      comment: entry?.comment ?? null,
    });
  }, [open, card.title, entry]);

  const achievedIsNumeric =
    local.achievedValue != null && Number.isFinite(local.achievedValue);
  const tier = achievedIsNumeric
    ? resolveCritTier(local.achievedValue, card.bullets)
    : null;

  const updateAchieved = (raw: string) => {
    setLocal((prev) => ({
      ...prev,
      achievedValue: raw === "" ? null : parseFloat(raw) || 0,
    }));
  };
  const updateComment = (raw: string) => {
    setLocal((prev) => ({ ...prev, comment: raw }));
  };

  const handleSave = async () => {
    const origAchieved = entry?.achievedValue ?? null;
    const origComment = entry?.comment ?? null;
    const dirty =
      local.achievedValue !== origAchieved ||
      (local.comment ?? null) !== origComment;
    if (!dirty) {
      onClose();
      return;
    }
    await onSave(local);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-sm font-semibold text-gray-800">Review Critical</h2>
            <span className="text-[11px] text-gray-500 mt-0.5 block truncate">
              {heading}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Critical Title — read-only */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Critical Title
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 font-medium">
              {card.title.trim() || "—"}
            </div>
          </div>

          {/* Projected — 4 rows, read-only, labeled by tier */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Projected
            </label>
            <div className="space-y-1.5">
              {[0, 1, 2, 3].map((i) => {
                const raw = card.bullets[i] ?? "";
                const num = toNum(raw);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg"
                  >
                    <span
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: CRIT_BULLET_COLORS[i] }}
                    />
                    <span className="text-xs text-gray-600 font-medium w-[90px] flex-shrink-0">
                      {CRIT_BULLET_LABELS[i]}
                    </span>
                    <span className="text-xs text-gray-800 font-medium">
                      {raw.trim() === "" ? (
                        <span className="text-gray-400">—</span>
                      ) : num !== null ? (
                        num.toLocaleString()
                      ) : (
                        raw
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Achieved — single numeric input */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Achieved
            </label>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={local.achievedValue ?? ""}
              onChange={(e) => updateAchieved(e.target.value)}
              placeholder="Enter value"
              disabled={readOnly}
              className={cn(
                "w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 focus:border-transparent",
                readOnly && "bg-gray-50 text-gray-500 cursor-not-allowed",
              )}
            />
          </div>

          {/* Status — live tier badge */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Status
            </label>
            {tier ? (
              <span
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold",
                  critTierCellClasses(tier),
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: CRIT_TIER_DOT_HEX[tier] }}
                />
                {CRIT_TIER_LABELS[tier]}
              </span>
            ) : (
              <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400 inline-block">
                Enter an Achieved value to see the tier
              </div>
            )}
          </div>

          {/* Comments — single textarea */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Comments
            </label>
            <textarea
              value={local.comment ?? ""}
              onChange={(e) => updateComment(e.target.value)}
              placeholder="Enter comment"
              rows={4}
              disabled={readOnly}
              className={cn(
                "w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 focus:border-transparent resize-none",
                readOnly && "bg-gray-50 text-gray-500 cursor-not-allowed",
              )}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!readOnly ? (
            <Button size="sm" loading={saving} onClick={handleSave}>
              Save Changes
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
