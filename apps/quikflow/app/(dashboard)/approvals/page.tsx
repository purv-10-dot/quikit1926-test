"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/page-states";
import type { ApprovalDTO } from "@/types";

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => apiGet<ApprovalDTO[]>("/api/approvals"),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approved" | "rejected" }) =>
      apiSend(`/api/approvals/${id}`, "PATCH", { decision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Approvals</h1>
        <p className="mt-1 text-sm text-gray-500">Workflows paused, waiting on a person.</p>
      </div>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        data.length === 0 ? (
          <EmptyState title="Nothing waiting on you" hint="Approval requests will appear here." />
        ) : (
          <div className="space-y-3">
            {data.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5"
              >
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    From &ldquo;{a.workflowName}&rdquo; · via {a.app}
                    {a.detail ? ` · ${a.detail}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: a.id, decision: "rejected" })}
                    className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-secondary)]"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: a.id, decision: "approved" })}
                    className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
