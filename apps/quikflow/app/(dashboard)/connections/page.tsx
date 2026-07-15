"use client";

import { useQuery } from "@tanstack/react-query";
import { Plug } from "lucide-react";
import { apiGet } from "@/lib/client/fetcher";
import { StatusPill } from "@/components/ui/status-pill";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/page-states";
import type { ConnectionDTO } from "@/types";

const LABELS: Record<string, string> = {
  quikscale: "QuikScale",
  quikcrm: "QuikCRM",
  quikhrms: "QuikHRMS",
  quikinfra: "QuikInfra",
  quiktrack: "QuikTrack",
  outlook: "Outlook",
  teams: "Microsoft Teams",
  gmail: "Gmail",
  slack: "Slack",
  sheets: "Google Sheets",
  webhook: "Webhook",
};

export default function ConnectionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiGet<ConnectionDTO[]>("/api/connections"),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Connections</h1>
          <p className="mt-1 text-sm text-gray-500">Apps and accounts your workflows can use.</p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
        >
          <Plug className="h-4 w-4" />
          Add connection
        </button>
      </div>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        data.length === 0 ? (
          <EmptyState
            title="No connections yet"
            hint="QuikScale is available automatically; connect Slack, Teams or Outlook to notify."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{LABELS[c.provider] ?? c.label}</p>
                    <p className="text-xs text-gray-500">{c.external ? "External" : "QuikIT app"}</p>
                  </div>
                  <StatusPill status={c.status} />
                </div>
                {c.status === "expired" ? (
                  <button
                    type="button"
                    className="mt-4 text-sm font-medium text-accent-700 hover:underline"
                  >
                    Reconnect
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
