"use client";

import { useState } from "react";
import { Scale } from "lucide-react";

const WEIGHT_LABELS = ["None", "Lowest", "Low", "Medium", "High", "Highest"] as const;

/** Weighted multi-select: a scale icon + 1–5 dots per option (JPD). Click a dot
 *  to set the strategic weight; clicking the active dot again clears to None. */
export function WeightDots({ weight, onSet }: { weight: number; onSet: (w: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || weight;
  return (
    <span className="flex items-center gap-1.5" onMouseLeave={() => setHover(0)}>
      <Scale className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      <span className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            title={WEIGHT_LABELS[n]}
            onMouseEnter={() => setHover(n)}
            onClick={() => onSet(n === weight ? 0 : n)}
            className="flex h-3.5 w-3.5 items-center justify-center"
          >
            <span className={`rounded-full transition-all ${n <= shown ? "h-2.5 w-2.5 bg-cyan-400" : "h-1 w-1 bg-gray-300"}`} />
          </button>
        ))}
      </span>
    </span>
  );
}
