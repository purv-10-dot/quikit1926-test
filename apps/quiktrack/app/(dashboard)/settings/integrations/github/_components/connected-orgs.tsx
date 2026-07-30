"use client";

import { CheckCircle2, Github, Loader2, RefreshCw } from "lucide-react";

export interface Installation {
  id: string;
  installationId: string;
  githubAccountLogin: string;
  targetType: string;
  repoSelection: string;
  backfillStatus: string;
  backfilledFrom: string | null;
  status: string;
  lastError: string | null;
}

const BACKFILL_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING: { text: "Pending", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  RUNNING: { text: "Backfilling…", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  FINISHED: { text: "Finished", cls: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  ERROR: { text: "Error", cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

/** Connected GitHub organizations — mirrors Jira's "GitHub configuration". */
export function ConnectedOrgs({
  installations,
  onChanged,
}: {
  installations: Installation[];
  onChanged: () => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Connected repositories
        </h2>
        <button
          onClick={onChanged}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <th className="bg-accent-50 px-6 py-2 font-medium dark:bg-accent-900/20">Connected organization</th>
            <th className="bg-accent-50 px-4 py-2 font-medium dark:bg-accent-900/20">Repository access</th>
            <th className="bg-accent-50 px-4 py-2 font-medium dark:bg-accent-900/20">Backfill status</th>
            <th className="bg-accent-50 px-4 py-2 font-medium dark:bg-accent-900/20">Permissions</th>
          </tr>
        </thead>
        <tbody>
          {installations.map((inst) => {
            const bf = BACKFILL_LABEL[inst.backfillStatus] ?? BACKFILL_LABEL.PENDING;
            return (
              <tr key={inst.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {inst.githubAccountLogin || "—"}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">{inst.targetType}</span>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  {inst.repoSelection === "ALL" ? "All repos" : "Selected repos"}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${bf.cls}`}>
                    {inst.backfillStatus === "RUNNING" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {inst.backfillStatus === "FINISHED" && <CheckCircle2 className="h-3 w-3" />}
                    {bf.text}
                  </span>
                  {inst.backfilledFrom && (
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      Backfilled from: {new Date(inst.backfilledFrom).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {/* FULL ACCESS badge mirrors Jira's Permissions column. The
                      GitHub App grants read/write on code/PRs/issues, so an
                      ACTIVE, non-errored install is full access. */}
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      inst.status === "ACTIVE" && !inst.lastError
                        ? "border-green-300 text-green-700 dark:border-green-500/50 dark:text-green-300"
                        : "border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {inst.status === "ACTIVE" && !inst.lastError ? "Full access" : inst.status}
                  </span>
                  {inst.lastError && (
                    <div className="mt-0.5 max-w-[200px] truncate text-[11px] text-red-500" title={inst.lastError}>
                      {inst.lastError}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
