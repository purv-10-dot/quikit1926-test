"use client";

import { Bot, CheckCircle2, User } from "lucide-react";

/**
 * The two read-only tables on Settings → QuikTest.
 *
 * Split from `test-statuses-view.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once templates joined statuses on the page. The view keeps
 * the state, warnings and the restore action; this file is presentation.
 */

export interface StatusRow {
  id: string;
  key: string;
  label: string;
  color: string;
  isFinal: boolean;
  isDefault: boolean;
  isAutomation: boolean;
  orderNo: number;
}

export interface TemplateRow {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
  projectId: string | null;
}

/** What each template changes about the case editor, in plain words. */
const KIND_HINT: Record<string, string> = {
  STEPS: "Numbered steps, each with its own expected result",
  TEXT: "One expected result for the whole case",
  BDD: "Given / When / Then prose",
  EXPLORATORY: "A charter to explore — no formal expectations",
};

const TH = "bg-accent-50 dark:bg-accent-900/30 px-4 py-2 font-medium text-gray-700 dark:text-gray-300";

function DefaultPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-700">
      <CheckCircle2 className="h-2.5 w-2.5" />
      Default
    </span>
  );
}

export function StatusTable({
  rows,
  loading,
}: {
  rows: StatusRow[];
  loading: boolean;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className={TH}>Status</th>
            <th className={TH}>Key</th>
            <th className={TH}>Recorded by</th>
            <th className={TH}>Counts as executed</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={4} className="px-4 py-4 text-sm text-gray-400">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-4 text-sm text-gray-500">
                This organisation has no test statuses. Restore the defaults to start
                using QuikTest.
              </td>
            </tr>
          )}
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-2">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-gray-800">{s.label}</span>
                  {s.isDefault && <DefaultPill />}
                </span>
              </td>
              <td className="px-4 py-2">
                {/* Shown because CI posts results against the KEY, not the label —
                    anyone wiring up automation needs to see it. */}
                <code className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                  {s.key}
                </code>
              </td>
              <td className="px-4 py-2 text-gray-500">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  {s.isAutomation ? (
                    <>
                      <Bot className="h-3.5 w-3.5" /> CI
                    </>
                  ) : (
                    <>
                      <User className="h-3.5 w-3.5" /> A person
                    </>
                  )}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-gray-500">
                {/* isFinal drives the pass-rate denominator, so it is worth stating
                    in plain words rather than as a raw flag. */}
                {s.isFinal ? "Yes" : "No — still counts as outstanding"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TemplateTable({ rows }: { rows: TemplateRow[] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className={TH}>Template</th>
            <th className={TH}>Layout</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-4 text-sm text-gray-500">
                No templates. The editor will fall back to the step-based layout —
                restore the defaults below.
              </td>
            </tr>
          )}
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-4 py-2">
                <span className="inline-flex items-center gap-2">
                  <span className="text-gray-800">{t.name}</span>
                  {t.isDefault && <DefaultPill />}
                  {t.projectId && (
                    <span className="rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                      This space only
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-gray-500">
                {KIND_HINT[t.kind] ?? t.kind}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
