"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { COLUMN_DESCRIPTIONS, RICE_DESCRIPTION } from "./column-descriptions";

/**
 * Column-header hover card (JPD). Wraps the header label; on hover it shows a
 * fixed-position popover with the field icon, name and description. Fixed
 * positioning + close-on-scroll escapes the table's overflow clipping. The RICE
 * "score" column gets the richer multi-paragraph + expression explainer.
 */
export function ColumnHeaderTooltip({
  colKey,
  fieldKey,
  label,
  help,
  Icon,
  iconNode,
  children,
}: {
  colKey: string;
  /** The underlying custom-field key, if any (e.g. "score"). */
  fieldKey?: string;
  label: string;
  /** Field's own helpText, used as a fallback description. */
  help?: string | null;
  Icon?: LucideIcon;
  /** Custom icon node (e.g. the "Aa" / "fx" glyphs) when there's no LucideIcon. */
  iconNode?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const isRice = fieldKey === "score" || colKey === "score";
  const description = COLUMN_DESCRIPTIONS[colKey] ?? help ?? "";

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [pos]);

  function open() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Prefer to sit just under the header, left-aligned; clamp to viewport.
    const width = 300;
    const left = Math.min(Math.max(8, r.left), (typeof window !== "undefined" ? window.innerWidth : 9999) - width - 8);
    setPos({ left, top: r.bottom + 6 });
  }

  // Nothing to show — render children plainly.
  if (!isRice && !description) return <>{children}</>;

  return (
    <span
      ref={ref}
      onMouseEnter={open}
      onMouseLeave={() => setPos(null)}
      className="inline-flex min-w-0 items-center gap-1.5"
    >
      {children}
      {pos && (
        <span
          className="fixed z-[80] block w-[300px] cursor-default whitespace-normal break-words rounded-lg border border-gray-200 bg-white p-3 text-left font-normal normal-case shadow-xl"
          style={{ left: pos.left, top: pos.top }}
          // The popover is a hover affordance; ignore its own pointer events so
          // moving onto it (near the header) doesn't cause flicker loops.
          onMouseEnter={() => setPos(pos)}
        >
          <span className="mb-1.5 flex items-start gap-1.5 text-sm font-semibold text-gray-800">
            <span className="mt-0.5 shrink-0">{iconNode ?? (Icon ? <Icon className="h-4 w-4 text-gray-500" /> : null)}</span>
            <span className="whitespace-normal break-words">{label}</span>
          </span>
          {isRice ? (
            <span className="block space-y-2 whitespace-normal break-words text-[13px] leading-relaxed text-gray-600">
              {RICE_DESCRIPTION.paragraphs.map((p, i) => (
                <span key={i} className="block">{p}</span>
              ))}
              <a
                href="https://www.atlassian.com/agile/product-management/prioritization-framework"
                target="_blank"
                rel="noopener noreferrer"
                className="block font-semibold text-blue-600 hover:underline"
              >
                Learn more about prioritization
              </a>
              <span className="block pt-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Expression</span>
              <code className="block whitespace-normal break-words rounded bg-gray-50 px-2 py-1 text-[12px] text-gray-700">{RICE_DESCRIPTION.expression}</code>
            </span>
          ) : (
            <span className="block whitespace-normal break-words text-[13px] leading-relaxed text-gray-600">{description}</span>
          )}
        </span>
      )}
    </span>
  );
}
