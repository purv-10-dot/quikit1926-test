"use client";

/**
 * OPSP Critical-Number card block — extracted from `page.tsx` in R6.
 *
 * Renders a titled card with 4 color-coded bullet inputs (green, yellow,
 * orange, red). Used for "Critical Numbers" and "Balancing Critical
 * Numbers" sections across the form.
 */

import { Card } from "./Card";
import { FInput } from "./RichEditor";
import type { CritCard } from "../types";

const BULLET_COLORS = ["#1a5c2e", "#4caf50", "#f5c518", "#e53935"];

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
        {BULLET_COLORS.map((color, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <FInput
              value={value.bullets[i] ?? ""}
              onChange={(v) => {
                const bullets = [...value.bullets];
                bullets[i] = v;
                onChange({ ...value, bullets });
              }}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
