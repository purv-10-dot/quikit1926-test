"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/page-states";
import { cn } from "@/lib/utils";
import type { TemplateDTO } from "@/types";

const CATEGORIES = ["All", "Performance", "Sales", "HR", "Construction", "Marketing", "Projects", "Meeting Rhythm"] as const;

export default function TemplatesPage() {
  const [cat, setCat] = useState<string>("All");
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiGet<TemplateDTO[]>("/api/templates"),
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<{ isAdmin: boolean }>("/api/me"),
  });

  const [pendingId, setPendingId] = useState<string | null>(null);

  // Automated "Auto-test": validates each template's graph (trigger + all
  // actions implemented + valid edges) with no side effects, and sets/clears the
  // Tested badge. Runs alongside the manual "Mark tested" option.
  interface AutotestSummary {
    total: number;
    passed: number;
    failed: number;
    results: { id: string; name: string; passed: boolean; failures: string[] }[];
  }
  const [autotesting, setAutotesting] = useState(false);
  const [summary, setSummary] = useState<AutotestSummary | null>(null);

  async function toggleTested(t: TemplateDTO, e: React.MouseEvent) {
    e.stopPropagation();
    setPendingId(t.id);
    try {
      await apiSend(`/api/templates/${t.id}`, "PATCH", { isTested: !t.isTested });
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
    } finally {
      setPendingId(null);
    }
  }

  async function autotestAll() {
    setAutotesting(true);
    setSummary(null);
    try {
      const data = await apiSend<AutotestSummary>("/api/templates/autotest", "POST");
      setSummary(data);
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
    } finally {
      setAutotesting(false);
    }
  }

  async function autotestOne(t: TemplateDTO, e: React.MouseEvent) {
    e.stopPropagation();
    setPendingId(t.id);
    try {
      const data = await apiSend<{ passed: boolean; checks: { label: string; ok: boolean; detail?: string }[] }>(
        `/api/templates/${t.id}/autotest`,
        "POST",
      );
      if (!data.passed) {
        const reasons = data.checks.filter((c) => !c.ok).map((c) => `• ${c.detail ?? c.label}`).join("\n");
        alert(`"${t.name}" did not pass auto-test:\n\n${reasons}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
    } finally {
      setPendingId(null);
    }
  }

  const rows = (data ?? []).filter((t) => (cat === "All" ? true : t.category === cat));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Templates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Start from a working workflow — just connect and turn on.
          </p>
        </div>
        {me?.isAdmin ? (
          <button
            type="button"
            onClick={autotestAll}
            disabled={autotesting}
            className="shrink-0 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {autotesting ? "Auto-testing…" : "Auto-test all"}
          </button>
        ) : null}
      </div>

      {summary ? (
        <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
          <p className="text-sm font-semibold">
            Auto-test: <span className="text-green-700">{summary.passed} passed</span>
            {summary.failed > 0 ? <span className="text-amber-700"> · {summary.failed} not runnable</span> : null}
            <span className="text-gray-400"> / {summary.total}</span>
          </p>
          {summary.failed > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-gray-500">
              {summary.results.filter((r) => !r.passed).map((r) => (
                <li key={r.id}>
                  <span className="font-medium text-gray-700">{r.name}</span> — {r.failures.join("; ")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium",
              cat === c ? "bg-accent-100 text-accent-700" : "text-gray-500 hover:bg-[var(--color-bg-secondary)]",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {data ? (
        rows.length === 0 ? (
          <EmptyState title="No templates in this category yet" />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(`/workflows/new?template=${t.id}`)}
                className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 text-left transition-colors hover:border-accent-400"
              >
                {t.isTested ? (
                  <span
                    className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700"
                    title={t.lastTestedAt ? `Tested end-to-end on ${new Date(t.lastTestedAt).toLocaleDateString()}` : "Tested end-to-end"}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Tested
                  </span>
                ) : null}
                <h3 className="pr-16 font-semibold">{t.name}</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t.category ?? "General"} · {t.app}
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs">
                  <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">
                    {t.triggerLabel ?? "trigger"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-gray-400" />
                  <span className="rounded bg-green-50 px-2 py-1 text-green-700">
                    {t.actionLabel ?? "action"}
                  </span>
                </div>
                {me?.isAdmin ? (
                  <div className="mt-3 flex items-center gap-3">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => autotestOne(t, e)}
                      onKeyDown={(e) => e.key === "Enter" && autotestOne(t, e as unknown as React.MouseEvent)}
                      className="text-[11px] font-semibold text-accent-700 hover:underline"
                      aria-disabled={pendingId === t.id}
                    >
                      {pendingId === t.id ? "Testing…" : "Auto-test"}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => toggleTested(t, e)}
                      onKeyDown={(e) => e.key === "Enter" && toggleTested(t, e as unknown as React.MouseEvent)}
                      className="text-[11px] font-medium text-gray-500 hover:underline"
                      aria-disabled={pendingId === t.id}
                    >
                      {t.isTested ? "Mark as untested" : "Mark tested (manual)"}
                    </span>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
