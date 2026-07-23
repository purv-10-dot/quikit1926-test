"use client";

/**
 * DocDetailLayout — shared chrome for transactional document detail pages
 * (RAB, DPR, GRN, PO, Bill, etc.).
 *
 * Renders: back link → title row with status badge → meta grid (key/value
 * pairs) → optional notes → line items table → optional footer.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export interface LineCol<T> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
  render: (row: T) => ReactNode;
}

export interface MetaItem {
  label: string;
  value: ReactNode;
}

interface Props<T> {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  statusBadge?: ReactNode;
  actions?: ReactNode;
  meta: MetaItem[];
  lineColumns: LineCol<T>[];
  lines: T[];
  footer?: ReactNode;
  /** Optional row key extractor — defaults to using the array index. */
  rowKey?: (row: T, index: number) => string | number;
}

export function DocDetailLayout<T>({
  backHref, backLabel, title, subtitle, statusBadge, actions,
  meta, lineColumns, lines, footer, rowKey,
}: Props<T>) {
  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-accent-700 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> {backLabel}
        </Link>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <header className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h1>
            {statusBadge}
          </div>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
      </header>

      {meta.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white mb-5 overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-slate-100">
            {meta.map((m, i) => (
              <div key={i} className="p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{m.label}</div>
                <div className="text-sm text-slate-900 mt-0.5 break-words">{m.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {lineColumns.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-slate-600">
              <tr>
                {lineColumns.map((c) => (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={`px-3 py-2 font-semibold ${
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={lineColumns.length} className="px-3 py-6 text-center text-xs text-slate-400">
                    No line items.
                  </td>
                </tr>
              ) : (
                lines.map((row, i) => (
                  <tr
                    key={rowKey ? rowKey(row, i) : i}
                    className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors"
                  >
                    {lineColumns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${
                          c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                        }`}
                      >
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
