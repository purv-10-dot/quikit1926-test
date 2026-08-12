"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { DashboardPin } from "@/lib/dashboard/types";

const PINS_KEY = ["dashboard", "pinned-reports"] as const;
const LEGACY_LOCAL_KEY = "qcrm.dashboard.pinnedTel.v1";
const ALT_LEGACY_LOCAL_KEY = "quikcrm.pinnedTelephonyReports";

const REPORT_CATALOG: { id: string; title: string }[] = [
  { id: "calls-by-disposition", title: "Calls by disposition" },
  { id: "day-wise", title: "Day-wise calls" },
  { id: "hourly", title: "Hourly distribution" },
  { id: "metrics-by-user", title: "Phone call metrics by users" },
  { id: "duration-by-user", title: "Talk time by user" },
  { id: "total-volume", title: "Total volume" },
];

async function fetchPins(): Promise<DashboardPin[]> {
  const res = await fetch("/api/dashboard/pinned-reports", { credentials: "include" });
  if (!res.ok) throw new Error(`Pins failed (${res.status})`);
  const json = (await res.json()) as { items: DashboardPin[] };
  return json.items;
}

async function postPin(reportId: string): Promise<DashboardPin[]> {
  const res = await fetch("/api/dashboard/pinned-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reportId }),
  });
  if (!res.ok) throw new Error(`Add pin failed (${res.status})`);
  const json = (await res.json()) as { items: DashboardPin[] };
  return json.items;
}

async function deletePin(reportId: string): Promise<DashboardPin[]> {
  const res = await fetch("/api/dashboard/pinned-reports", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reportId }),
  });
  if (!res.ok) throw new Error(`Delete pin failed (${res.status})`);
  const json = (await res.json()) as { items: DashboardPin[] };
  return json.items;
}

async function reorderPins(order: string[]): Promise<DashboardPin[]> {
  const res = await fetch("/api/dashboard/pinned-reports", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error(`Reorder failed (${res.status})`);
  const json = (await res.json()) as { items: DashboardPin[] };
  return json.items;
}

export function PinnedReportsBand() {
  const queryClient = useQueryClient();
  const migratedRef = useRef(false);

  const { data: pins = [] } = useQuery<DashboardPin[]>({
    queryKey: PINS_KEY,
    queryFn: fetchPins,
    staleTime: 5 * 60 * 1000,
  });

  // Migrate localStorage pins on first successful load.
  useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    if (typeof window === "undefined") return;

    const collect = (key: string): string[] => {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    };

    const localIds = [
      ...new Set([...collect(LEGACY_LOCAL_KEY), ...collect(ALT_LEGACY_LOCAL_KEY)]),
    ];
    if (localIds.length === 0 || pins.length > 0) return;

    void (async () => {
      try {
        for (const id of localIds) {
          await postPin(id);
        }
        window.localStorage.removeItem(LEGACY_LOCAL_KEY);
        window.localStorage.removeItem(ALT_LEGACY_LOCAL_KEY);
        await queryClient.invalidateQueries({ queryKey: PINS_KEY });
      } catch {
        // Migration is best-effort — leave the local key alone if the network fails.
      }
    })();
  }, [pins.length, queryClient]);

  const removeMut = useMutation({
    mutationFn: deletePin,
    onSuccess: (items) => queryClient.setQueryData(PINS_KEY, items),
  });

  const reorderMut = useMutation({
    mutationFn: reorderPins,
    onSuccess: (items) => queryClient.setQueryData(PINS_KEY, items),
  });

  function move(idx: number, dir: -1 | 1) {
    const next = [...pins];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    reorderMut.mutate(next.map((p) => p.reportId));
  }

  if (pins.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-crm-border bg-crm-peach/30 px-4 py-3">
      <h2 className="text-sm font-semibold text-crm-text">Pinned telephony reports</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {pins.map((pin, i) => {
          const meta = REPORT_CATALOG.find((c) => c.id === pin.reportId);
          if (!meta) return null;
          return (
            <li
              key={pin.id}
              className="inline-flex items-center gap-1 rounded-full border border-crm-border bg-white px-2 py-1 text-xs"
            >
              <Link
                href={`/reports/telephony?r=${encodeURIComponent(pin.reportId)}`}
                className="font-medium text-crm-blue hover:underline"
              >
                {meta.title}
              </Link>
              <button
                type="button"
                aria-label={`Move ${meta.title} up`}
                onClick={() => move(i, -1)}
                disabled={i === 0 || reorderMut.isPending}
                className="text-crm-muted hover:text-crm-text disabled:opacity-30"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={`Move ${meta.title} down`}
                onClick={() => move(i, 1)}
                disabled={i === pins.length - 1 || reorderMut.isPending}
                className="text-crm-muted hover:text-crm-text disabled:opacity-30"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={`Unpin ${meta.title}`}
                onClick={() => removeMut.mutate(pin.reportId)}
                disabled={removeMut.isPending}
                className="text-crm-muted hover:text-rose-600"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
