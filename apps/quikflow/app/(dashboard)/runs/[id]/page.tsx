"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, RotateCcw } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState } from "@/components/ui/page-states";
import { RunConsole, type ConsoleStatus, type ConsoleEntry } from "@/components/builder/run-console";
import { runStepLabel } from "@/lib/builder/labels";

interface StepLog {
  id: string;
  nodeId: string;
  kind: string;
  label: string | null;
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
}

interface RunDetail {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  triggerData: Record<string, unknown> | null;
  workflow: { name: string; app: string };
  steps: StepLog[];
}

function when(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

/** Map a persisted step status to the console's 4-state model. */
function consoleStatus(status: string): ConsoleStatus {
  if (status === "success") return "ok";
  if (status === "failed") return "error";
  if (status === "running") return "running";
  return "idle";
}

export default function RunDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["run", id],
    queryFn: () => apiGet<RunDetail>(`/api/runs/${id}`),
  });

  const retry = useMutation({
    mutationFn: () => apiSend<{ run: { status: string; steps: number } | null }>(`/api/runs/${id}/retry`, "POST"),
    onSuccess: (res) => {
      setRetryMsg(res.run ? `Re-run ${res.run.status} · ${res.run.steps} step(s). Opening Run History…` : "Re-run queued.");
      setTimeout(() => router.push("/runs"), 900);
    },
    onError: (e) => setRetryMsg((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/runs"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Run History
      </Link>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{data.workflow.name}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {data.workflow.app} · {when(data.startedAt)}
                {data.durationMs != null ? ` · ${(data.durationMs / 1000).toFixed(1)}s` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={data.status} />
              {data.status === "failed" ? (
                <button
                  type="button"
                  onClick={() => {
                    setRetryMsg(null);
                    retry.mutate();
                  }}
                  disabled={retry.isPending}
                  className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-60"
                >
                  <RotateCcw className="h-4 w-4" />
                  {retry.isPending ? "Retrying…" : "Retry"}
                </button>
              ) : null}
            </div>
          </div>

          {retryMsg ? (
            <p className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{retryMsg}</p>
          ) : null}

          {data.error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {data.error}
            </p>
          ) : null}

          <div className="mt-6">
            <RunConsole
              title="Step timeline"
              emptyHint="No steps were recorded for this run."
              entries={data.steps.map<ConsoleEntry>((s) => ({
                id: s.id,
                kind: s.kind,
                label: runStepLabel(s.kind, s.label, s.output),
                status: consoleStatus(s.status),
                output: s.output && Object.keys(s.output).length > 0 ? s.output : undefined,
                error: s.error ?? undefined,
              }))}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
