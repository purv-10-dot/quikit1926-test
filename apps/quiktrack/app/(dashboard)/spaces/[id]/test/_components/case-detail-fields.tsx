"use client";

import type { ReactNode } from "react";
import { formatEstimate } from "@/lib/test/estimate";
import {
  APPROVAL_CLASS,
  PRIORITY_CLASS,
  labelOf,
  type CaseLabel,
} from "./case-meta";

/**
 * Presentational rows for the read-only case detail panel (QUIKTR-336).
 *
 * Kept beside `case-detail-panel.tsx` so the panel stays composition and the
 * 300-line ceiling in apps/quiktrack/CLAUDE.md holds.
 */

/** One label/value row. Renders nothing when there is no value to show. */
export function DetailRow({
  label,
  children,
  hideWhenEmpty = true,
}: {
  label: string;
  children: ReactNode;
  hideWhenEmpty?: boolean;
}) {
  // An empty row is worse than an absent one on a read-only surface: a column of
  // dashes buries the fields that are actually filled in.
  const empty =
    children === null ||
    children === undefined ||
    children === "" ||
    children === false;
  if (empty && hideWhenEmpty) return null;

  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-800">{empty ? "—" : children}</dd>
    </div>
  );
}

export function PriorityPill({ value }: { value: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        PRIORITY_CLASS[value] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {labelOf(value)}
    </span>
  );
}

export function ApprovalPill({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        APPROVAL_CLASS[value] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {labelOf(value)}
    </span>
  );
}

export function LabelChips({ labels }: { labels: CaseLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l.id}
          className="rounded px-1.5 py-0.5 text-[11px]"
          style={{
            backgroundColor: `${l.color ?? "#64748b"}20`,
            color: l.color ?? "#64748b",
          }}
        >
          {l.name}
        </span>
      ))}
    </span>
  );
}

/** Estimate rendered in the short form the editor accepts. */
export function EstimateText({ ms }: { ms: number | null }) {
  const text = formatEstimate(ms);
  return text ? <>{text}</> : null;
}

/**
 * Steps as a numbered list — the spec's presentation for the STEPS template.
 *
 * `expected` is optional per step, so the "Expected" line is omitted rather than
 * shown blank.
 */
export function StepList({
  steps,
}: {
  steps: Array<{ id: string; action: string; expected: string | null }>;
}) {
  if (steps.length === 0) {
    return <p className="text-sm text-gray-400">No steps recorded.</p>;
  }

  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.id} className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-medium text-gray-600">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap text-sm text-gray-800">{s.action}</p>
            {s.expected && (
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-500">
                <span className="font-medium text-gray-600">Expected: </span>
                {s.expected}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A paragraph block that preserves the author's line breaks. */
export function TextBlock({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="whitespace-pre-wrap text-sm text-gray-800">{text}</p>
  );
}
