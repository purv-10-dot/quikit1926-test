"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/page-states";
import { cn } from "@/lib/utils";
import type { WorkflowDTO } from "@/types";

const TABS = ["All", "Live", "Paused", "Drafts", "Errors"] as const;
type Tab = (typeof TABS)[number];

const TAB_TO_STATUS: Record<Tab, string | null> = {
  All: null,
  Live: "Active",
  Paused: "Paused",
  Drafts: "Draft",
  Errors: "Archived",
};

function displayStatus(s: string): string {
  return s === "Active" ? "Live" : s;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function WorkflowsPage() {
  const [tab, setTab] = useState<Tab>("All");
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => apiGet<WorkflowDTO[]>("/api/workflows"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      apiSend(`/api/workflows/${id}/toggle`, "PATCH", { on }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const status = TAB_TO_STATUS[tab];
  const rows = (data ?? []).filter((w) => (status ? w.status === status : true));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">Your automations. Toggle any one on or off.</p>
        </div>
        <Link
          href="/workflows/new"
          className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
        >
          <Plus className="h-4 w-4" />
          New workflow
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              tab === t
                ? "bg-accent-100 text-accent-700"
                : "text-gray-500 hover:bg-[var(--color-bg-secondary)]",
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
          <EmptyState title="No workflows here yet" hint="Create one from scratch or a template." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3 font-semibold">Workflow</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Last run</th>
                  <th className="px-5 py-3 font-semibold">Owner</th>
                  <th className="px-5 py-3 text-right font-semibold">On / Off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((w) => (
                  <tr key={w.id} className="hover:bg-[var(--color-bg-secondary)]">
                    <td className="px-5 py-3">
                      <Link href={`/workflows/${w.id}`} className="font-semibold hover:underline">
                        {w.name}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {w.app} · {w.triggerLabel ?? "trigger"}
                        {w.actionLabel ? ` → ${w.actionLabel}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={displayStatus(w.status)} label={displayStatus(w.status)} />
                    </td>
                    <td className="px-5 py-3 text-gray-500">{timeAgo(w.lastRunAt)}</td>
                    <td className="px-5 py-3 text-gray-600">{w.ownerName ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        aria-label={w.status === "Active" ? "Turn off" : "Turn on"}
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate({ id: w.id, on: w.status !== "Active" })}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                          w.status === "Active" ? "bg-accent-600" : "bg-gray-300",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                            w.status === "Active" ? "translate-x-5" : "translate-x-0.5",
                          )}
                        />
                      </button>
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
