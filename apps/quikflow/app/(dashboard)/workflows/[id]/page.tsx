"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, Play } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState } from "@/components/ui/page-states";

interface WorkflowDetail {
  id: string;
  name: string;
  app: string;
  scope: string;
  status: string;
  trigger: unknown;
  graphNodes: { id: string; kind: string; label?: string }[];
}

export default function WorkflowDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => apiGet<WorkflowDetail>(`/api/workflows/${id}`),
  });

  const run = useMutation({
    mutationFn: () => apiSend<{ run: { status: string; steps: number } | null }>(`/api/workflows/${id}/run`, "POST"),
    onSuccess: (res) => {
      setRunMsg(
        res.run
          ? `Run ${res.run.status} · ${res.run.steps} step(s). Opening Run History…`
          : "Already run (idempotent).",
      );
      setTimeout(() => router.push("/runs"), 900);
    },
    onError: (e) => setRunMsg((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/workflows"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Workflows
      </Link>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{data.name}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {data.app} · {data.scope === "org" ? "Org-wide" : "Personal"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={data.status === "Active" ? "Live" : data.status} />
              <button
                type="button"
                onClick={() => {
                  setRunMsg(null);
                  run.mutate();
                }}
                disabled={run.isPending}
                className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                {run.isPending ? "Running…" : "Run now"}
              </button>
            </div>
          </div>

          {runMsg ? (
            <p className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{runMsg}</p>
          ) : null}

          <ol className="mt-6 space-y-2">
            {(Array.isArray(data.graphNodes) ? data.graphNodes : []).map((n, i) => (
              <li
                key={n.id ?? i}
                className="rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {n.kind}
                </span>
                <p className="font-medium">{n.label ?? n.kind}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
