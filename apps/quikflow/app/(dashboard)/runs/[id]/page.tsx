"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { apiGet } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState } from "@/components/ui/page-states";

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

export default function RunDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, isLoading, error } = useQuery({
    queryKey: ["run", id],
    queryFn: () => apiGet<RunDetail>(`/api/runs/${id}`),
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
            <StatusPill status={data.status} />
          </div>

          {data.error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {data.error}
            </p>
          ) : null}

          <h2 className="mt-6 mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Step timeline
          </h2>
          <ol className="space-y-3">
            {data.steps.map((s, i) => (
              <li key={s.id} className="relative rounded-lg border border-[var(--color-border)] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700">
                      {i + 1}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {s.kind}
                    </span>
                    <span className="font-medium">{s.label ?? s.kind}</span>
                  </div>
                  <StatusPill status={s.status} />
                </div>
                {s.error ? <p className="mt-2 text-sm text-red-600">{s.error}</p> : null}
                {s.output && Object.keys(s.output).length > 0 ? (
                  <pre className="mt-2 overflow-x-auto rounded bg-[var(--color-bg-secondary)] p-2 text-xs text-gray-600">
                    {JSON.stringify(s.output, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
