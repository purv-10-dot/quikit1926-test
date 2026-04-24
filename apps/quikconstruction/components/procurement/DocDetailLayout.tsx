"use client";

/**
 * Generic document-detail page layout. Header meta grid + line-items table.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export interface MetaField { label: string; value: ReactNode }
export interface LineCol<Row> { key: string; label: string; render: (r: Row) => ReactNode; align?: "left" | "right" | "center" }

interface Props<Row> {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: ReactNode;
  statusBadge?: ReactNode;
  actions?: ReactNode;
  meta: MetaField[];
  lineTitle?: string;
  lineColumns: LineCol<Row>[];
  lines: Row[];
  footer?: ReactNode;
}

export function DocDetailLayout<Row>({
  backHref, backLabel, title, subtitle, statusBadge, actions,
  meta, lineTitle = "Line Items", lineColumns, lines, footer,
}: Props<Row>) {
  return (
    <div className="p-6 max-w-6xl">
      <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> {backLabel}
      </Link>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {statusBadge}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-gray-100">
          {meta.map((m, i) => (
            <div key={i} className="p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{m.label}</div>
              <div className="text-sm text-gray-900 mt-0.5 break-words">{m.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{lineTitle}</h2>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                {lineColumns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 text-${c.align ?? "left"}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr><td colSpan={lineColumns.length} className="px-3 py-6 text-center text-xs text-gray-400">No line items</td></tr>
              ) : (
                lines.map((line, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    {lineColumns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 text-gray-700 text-${c.align ?? "left"}`}>
                        {c.render(line)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {footer && <div className="mt-5">{footer}</div>}
    </div>
  );
}
