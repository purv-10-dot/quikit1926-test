"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { apiGet } from "@/lib/client/fetcher";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/page-states";
import { cn } from "@/lib/utils";
import type { TemplateDTO } from "@/types";

const CATEGORIES = ["All", "Performance", "Sales", "HR", "Construction", "Marketing", "Projects"] as const;

export default function TemplatesPage() {
  const [cat, setCat] = useState<string>("All");
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiGet<TemplateDTO[]>("/api/templates"),
  });

  const rows = (data ?? []).filter((t) => (cat === "All" ? true : t.category === cat));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Templates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Start from a working workflow — just connect and turn on.
        </p>
      </div>

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
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 text-left transition-colors hover:border-accent-400"
              >
                <h3 className="font-semibold">{t.name}</h3>
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
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
