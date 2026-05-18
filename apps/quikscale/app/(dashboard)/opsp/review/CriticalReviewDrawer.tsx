"use client";

/**
 * CriticalReviewDrawer — right-side slide-in panel that edits one Critical
 * card's 4 bullet rows (Green / Light Green / Yellow / Red). Mirrors the
 * "Review Action" / "Review Goals" drawer used by the existing Review tab,
 * but tabs are color labels instead of months/quarters/years.
 *
 * Per-tab fields:
 *   - Projected (read-only, from the CritCard bullet text)
 *   - Achieved (numeric input)
 *   - Gap = Achieved − Projected (live derived)
 *   - Achieved % = Achieved / Projected × 100 (live derived)
 *   - Comments (textarea)
 *
 * Save Changes → POSTs each changed bullet to /api/opsp/review/critical via
 * the parent's `onSave(bulletIndex, patch)` callback.
 */

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@quikit/ui";
import { cn } from "@/lib/utils";
import { CRIT_BULLET_COLORS, CRIT_BULLET_LABELS, achievedPctColor } from "./helpers";
import type { CriticalTableEntry } from "./CriticalTable";

export interface CriticalReviewDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header title: "Critical # — Growth" / "Balancing Critical # — Stability" */
  heading: string;
  /** The CritCard payload (title + 4 bullets) the drawer is editing. */
  card: { title: string; bullets: string[] };
  /** Saved entries keyed by bullet index 0..3 (initial values on open). */
  entries: Partial<Record<number, CriticalTableEntry>>;
  /** Disables inputs (OPSP draft / reviewed). */
  readOnly?: boolean;
  /** Called for every (bullet, patch) the user actually changed on save. */
  onSave: (
    changes: Array<{ bulletIndex: number; patch: CriticalTableEntry }>,
  ) => Promise<void> | void;
  saving?: boolean;
}

function parseProjected(s: string): number {
  const trimmed = (s ?? "").replace(/[,\s]/g, "").trim();
  if (!trimmed) return NaN;
  return parseFloat(trimmed);
}

export function CriticalReviewDrawer({
  open,
  onClose,
  heading,
  card,
  entries,
  readOnly = false,
  onSave,
  saving = false,
}: CriticalReviewDrawerProps) {
  const [activeBullet, setActiveBullet] = useState(0);
  // Local working copy — committed only on Save Changes.
  const [local, setLocal] = useState<Record<number, CriticalTableEntry>>({});

  // Reset local state every time the drawer opens with a (possibly new) card.
  useEffect(() => {
    if (!open) return;
    const next: Record<number, CriticalTableEntry> = {};
    for (let i = 0; i < 4; i++) {
      next[i] = {
        achievedValue: entries[i]?.achievedValue ?? null,
        comment: entries[i]?.comment ?? null,
      };
    }
    setLocal(next);
    setActiveBullet(0);
  }, [open, card.title, entries]);

  const projectedNum = useMemo(
    () => parseProjected(card.bullets[activeBullet] ?? ""),
    [card.bullets, activeBullet],
  );
  const projectedIsNumeric = Number.isFinite(projectedNum);

  const tab = local[activeBullet] ?? { achievedValue: null, comment: null };

  const achievedNum = tab.achievedValue;
  const achievedIsNumeric = achievedNum != null && Number.isFinite(achievedNum);

  const gap =
    achievedIsNumeric && projectedIsNumeric ? achievedNum! - projectedNum : null;
  const pctNum =
    achievedIsNumeric && projectedIsNumeric && projectedNum !== 0
      ? Math.round((achievedNum! / projectedNum) * 10000) / 100 // 2 decimals
      : null;
  const pctColor =
    pctNum != null ? achievedPctColor(pctNum) : "";

  const updateField = (field: "achievedValue" | "comment", value: string) => {
    setLocal((prev) => ({
      ...prev,
      [activeBullet]: {
        ...prev[activeBullet],
        [field]:
          field === "achievedValue"
            ? value === ""
              ? null
              : parseFloat(value) || 0
            : value,
      },
    }));
  };

  const handleSave = async () => {
    // Diff each bullet against the original entries and only ship the changed ones.
    const changes: Array<{ bulletIndex: number; patch: CriticalTableEntry }> = [];
    for (let i = 0; i < 4; i++) {
      const curr = local[i] ?? { achievedValue: null, comment: null };
      const orig = entries[i] ?? { achievedValue: null, comment: null };
      if (
        curr.achievedValue !== (orig.achievedValue ?? null) ||
        (curr.comment ?? null) !== (orig.comment ?? null)
      ) {
        changes.push({ bulletIndex: i, patch: curr });
      }
    }
    if (changes.length === 0) {
      onClose();
      return;
    }
    await onSave(changes);
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

        {/* Color tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100 flex-shrink-0">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              onClick={() => setActiveBullet(i)}
              className={cn(
                "px-3 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5",
                activeBullet === i
                  ? "border-accent-600 text-accent-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: CRIT_BULLET_COLORS[i] }}
              />
              {CRIT_BULLET_LABELS[i]}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Projected — read-only */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Projected
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 font-medium">
              {(card.bullets[activeBullet] ?? "").trim() === ""
                ? "—"
                : projectedIsNumeric
                  ? projectedNum.toLocaleString()
                  : card.bullets[activeBullet]}
            </div>
            {!projectedIsNumeric && (card.bullets[activeBullet] ?? "").trim() !== "" ? (
              <p className="text-[10px] text-amber-600 mt-1">
                Projected is non-numeric — Gap and Achieved % won&apos;t compute.
              </p>
            ) : null}
          </div>

          {/* Achieved */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Achieved
            </label>
            <input
              type="number"
              step="any"
              value={tab.achievedValue ?? ""}
              onChange={(e) => updateField("achievedValue", e.target.value)}
              placeholder="Enter value"
              disabled={readOnly || !projectedIsNumeric}
              className={cn(
                "w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 focus:border-transparent",
                (readOnly || !projectedIsNumeric) && "bg-gray-50 text-gray-500 cursor-not-allowed",
              )}
            />
          </div>

          {/* Gap + Achieved % */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Gap
              </label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 font-medium">
                {gap == null
                  ? "—"
                  : (() => {
                      const sign = gap > 0 ? "+" : gap < 0 ? "−" : "";
                      return `${sign}${Math.abs(gap).toLocaleString()}`;
                    })()}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Achieved %
              </label>
              <div
                className={cn(
                  "px-3 py-2 border rounded-lg text-xs font-medium",
                  pctNum != null
                    ? cn(pctColor, "text-white border-transparent")
                    : "bg-gray-50 border-gray-200 text-gray-500",
                )}
              >
                {pctNum != null ? `${pctNum}%` : "—"}
              </div>
            </div>
          </div>

          {/* Comments */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Comments
            </label>
            <textarea
              value={tab.comment ?? ""}
              onChange={(e) => updateField("comment", e.target.value)}
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
