"use client";

/**
 * OPSP Critical-Number card block — extracted from `page.tsx` in R6.
 *
 * Renders a titled card with 4 color-coded bullet inputs labeled
 * Super Green / Light Green / Yellow / Red. Title is free-text; the
 * four bullets are numeric (Projected thresholds used by the review
 * tier-resolution in `opspHelpers.resolveCritTier`).
 */

import { Card } from "./Card";
import type { CritCard } from "../types";

const BULLET_TIERS: { color: string; label: string }[] = [
  { color: "#1a5c2e", label: "Super Green" },
  { color: "#4caf50", label: "Light Green" },
  { color: "#f5c518", label: "Yellow" },
  { color: "#e53935", label: "Red" },
];

export function CritBlock({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CritCard;
  onChange: (v: CritCard) => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">
          {label}:
        </span>
        <input
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          placeholder="Enter title here"
          className="flex-1 min-w-0 text-xs border-0 border-b border-dashed border-gray-300 focus:outline-none text-gray-500 placeholder-gray-400 bg-transparent overflow-hidden"
        />
      </div>
      <div className="space-y-1.5">
        {BULLET_TIERS.map((tier, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: tier.color }}
            />
            <span className="text-xs text-gray-600 w-20 flex-shrink-0">
              {tier.label}
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={value.bullets[i] ?? ""}
              onChange={(e) => {
                const bullets = [...value.bullets];
                bullets[i] = e.target.value;
                onChange({ ...value, bullets });
              }}
              placeholder="0"
              className="flex-1 min-w-0 border border-gray-200 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
