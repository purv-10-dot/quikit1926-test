"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/page-states";
import { cn } from "@/lib/utils";
import type { RunDTO } from "@/types";

const TABS = ["All", "Success", "Failed", "Waiting"] as const;
type Tab = (typeof TABS)[number];
const TAB_STATUS: Record<Tab, string | null> = {
  All: null,
  Success: "success",
  Failed: "failed",
  Waiting: "waiting",
};

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString()} ${time}`;
}

export default function RunsPage() {
  const [tab, setTab] = useState<Tab>("All");
  const { data, isLoading, error } = useQuery({
    queryKey: ["runs"],
    queryFn: () => apiGet<RunDTO[]>("/api/runs"),
  });

  const status = TAB_STATUS[tab];
  const rows = (data ?? []).filter((r) => (status ? r.status === status : true));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Run History</h1>
        <p className="mt-1 text-sm text-gray-500">Every time a workflow fired.</p>
      </div>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              tab === t ? "bg-accent-100 text-accent-700" : "text-gray-500 hover:bg-[var(--color-bg-secondary)]",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        rows.length === 0 ? (
          <EmptyState title="No runs yet" hint="Runs appear here once a live workflow fires." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3 font-semibold">Workflow</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-5 py-3 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--color-bg-secondary)]">
                    <td className="px-5 py-3 font-medium">
                      <Link href={`/runs/${r.id}`} className="hover:underline">
                        {r.workflowName}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-500">{when(r.startedAt)}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
