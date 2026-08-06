"use client";

/**
 * HTML renderer for the Knowledge-Base block vocabulary.
 *
 * Every block type in lib/knowledge-base/types.ts must be handled here AND in
 * KBPdfDoc.tsx. The switch below is exhaustive by construction — add a block
 * type and TypeScript will not complain, so keep the two renderers in step by
 * hand when the vocabulary grows.
 */

import { Info, Lightbulb, AlertTriangle, ShieldCheck } from "lucide-react";
import type { KBBlock, KBTone } from "@/lib/knowledge-base/types";
import { KBFigure } from "./KBFigure";

const TONE: Record<
  KBTone,
  { icon: React.ElementType; wrap: string; title: string; body: string; label: string }
> = {
  info: { icon: Info,        wrap: "border-blue-200 bg-blue-50/60",   title: "text-blue-900",  body: "text-blue-800",  label: "Note" },
  tip:  { icon: Lightbulb,   wrap: "border-green-200 bg-green-50/60", title: "text-green-900", body: "text-green-800", label: "Tip" },
  warn: { icon: AlertTriangle, wrap: "border-amber-200 bg-amber-50/60", title: "text-amber-900", body: "text-amber-800", label: "Careful" },
  rule: { icon: ShieldCheck, wrap: "border-gray-300 bg-gray-50",      title: "text-gray-900",  body: "text-gray-700",  label: "Rule" },
};

export function KBBlocks({ blocks }: { blocks: KBBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </>
  );
}

function Block({ block: b }: { block: KBBlock }) {
  switch (b.type) {
    case "p":
      return <p className="my-3 text-[15px] leading-7 text-gray-700">{b.text}</p>;

    case "h3":
      return <h4 className="mt-7 mb-2 text-[15px] font-semibold text-gray-900">{b.text}</h4>;

    case "bullets":
      return b.ordered ? (
        <ol className="my-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-gray-700 marker:text-gray-400">
          {b.items.map((it, i) => <li key={i}>{it}</li>)}
        </ol>
      ) : (
        <ul className="my-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-gray-700 marker:text-gray-300">
          {b.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      );

    case "steps":
      return (
        <ol className="my-4 space-y-3">
          {b.items.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-gray-900">{s.title}</p>
                <p className="mt-0.5 text-[15px] leading-7 text-gray-600">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <div className="my-5">
          {b.caption && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{b.caption}</p>
          )}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr>
                  {b.head.map((h, i) => (
                    <th
                      key={i}
                      className="border-b border-gray-200 bg-accent-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                      style={b.widths ? { width: `${(b.widths[i] / b.widths.reduce((a, c) => a + c, 0)) * 100}%` } : undefined}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className="odd:bg-white even:bg-gray-50/50">
                    {r.map((c, ci) => (
                      <td key={ci} className="border-b border-gray-100 px-3 py-2 align-top leading-6 text-gray-700">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case "callout": {
      const t = TONE[b.tone];
      const Icon = t.icon;
      return (
        <div className={`my-5 rounded-lg border px-4 py-3 ${t.wrap}`}>
          <div className="flex gap-3">
            <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${t.title}`} />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${t.title}`}>{b.title}</p>
              <p className={`mt-1 text-sm leading-6 ${t.body}`}>{b.text}</p>
            </div>
          </div>
        </div>
      );
    }

    case "figure":
      return <KBFigure file={b.file} caption={b.caption} hint={b.hint} />;

    case "faq":
      // Two columns from `lg` up — FAQ answers are short, so a single column
      // wastes the width the three-pane layout gives us.
      return (
        <div className="my-5 grid gap-3 lg:grid-cols-2">
          {b.items.map((f, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{f.q}</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">{f.a}</p>
            </div>
          ))}
        </div>
      );

    case "kv":
      return (
        <dl className="my-4 space-y-2.5">
          {b.items.map((kv, i) => (
            <div key={i} className="grid gap-1 sm:grid-cols-[minmax(140px,26%)_1fr] sm:gap-4">
              <dt className="text-sm font-semibold text-gray-900">{kv.k}</dt>
              <dd className="text-sm leading-6 text-gray-600">{kv.v}</dd>
            </div>
          ))}
        </dl>
      );

    default:
      return null;
  }
}
