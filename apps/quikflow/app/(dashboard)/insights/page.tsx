"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/fetcher";
import { LoadingState, ErrorState } from "@/components/ui/page-states";
import type { InsightsData } from "@/types";

export default function InsightsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights"],
    queryFn: () => apiGet<InsightsData>("/api/insights"),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Insights</h1>
        <p className="mt-1 text-sm text-gray-500">How your automation is performing.</p>
      </div>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
              <h2 className="mb-4 text-base font-semibold">Runs per day · last 7 days</h2>
              <BarChart data={data.runsPerDay} />
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
              <h2 className="mb-4 text-base font-semibold">Success rate</h2>
              <SuccessDonut
                rate={data.successRate.rate}
                succeeded={data.successRate.succeeded}
                failed={data.successRate.failed}
              />
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5">
            <h2 className="mb-4 text-base font-semibold">Most active workflows</h2>
            {data.mostActive.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {data.mostActive.map((m) => (
                  <li key={m.workflowId} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{m.workflowName}</p>
                      <p className="text-xs text-gray-500">{m.app}</p>
                    </div>
                    <span className="text-sm text-gray-600">{m.runs} runs</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function BarChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-40 items-end justify-between gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full rounded-t bg-accent-600"
            style={{ height: `${Math.max(4, (d.count / max) * 130)}px` }}
            title={`${d.count} runs`}
          />
          <span className="text-xs text-gray-500">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

function SuccessDonut({
  rate,
  succeeded,
  failed,
}: {
  rate: number | null;
  succeeded: number;
  failed: number;
}) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const pct = rate ?? 0;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-border)" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#16a34a"
          strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
        <text x="50" y="52" transform="rotate(90 50 50)" textAnchor="middle" className="fill-current text-[14px] font-bold">
          {rate === null ? "—" : `${rate}%`}
        </text>
      </svg>
      <div className="text-sm">
        <p className="text-green-600">
          <span className="font-semibold">{succeeded}</span> succeeded
        </p>
        <p className="mt-1 text-red-600">
          <span className="font-semibold">{failed}</span> failed
        </p>
      </div>
    </div>
  );
}
