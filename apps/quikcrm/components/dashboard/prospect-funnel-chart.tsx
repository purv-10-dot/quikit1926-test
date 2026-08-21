"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import { ChartCard, ChartCardSkeleton } from "./chart-card";
import { REFRESH_MS } from "./refresh-interval";
import type { FunnelStep } from "@/lib/dashboard/types";

type ProspectFunnelDto = {
  steps: FunnelStep[];
  total: number;
  scope: "org" | "own";
  canFilterByUser: boolean;
};

type PickerUser = { id: string; name: string; email: string; role: string };

// Same ramp as the lead funnel so the two cards read as one system.
const FUNNEL_COLORS = ["#2563eb", "#3b82f6", "#7c3aed", "#0d9488", "#059669", "#d97706"];

async function fetchProspectFunnel(qs: string, tz: string): Promise<ProspectFunnelDto> {
  const res = await fetch(`/api/dashboard/prospect-funnel?${qs}`, {
    credentials: "include",
    headers: { "X-Client-TZ": tz },
  });
  if (!res.ok) throw new Error(`Prospect funnel failed (${res.status})`);
  const json = (await res.json()) as
    | { success: true; data: ProspectFunnelDto }
    | { success: false; error: string };
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function fetchUsers(): Promise<PickerUser[]> {
  const res = await fetch("/api/users/picker", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  const json = (await res.json()) as { items: PickerUser[] };
  return json.items;
}

/**
 * Dashboard → Prospect funnel.
 *
 * Counts come from GET /api/dashboard/prospect-funnel, which groups the live
 * CrmProspect table by `status` under the existing prospect ACL. Because the
 * query key includes the owner selection, the card re-fetches whenever a
 * prospect is created, converted, deleted or the filter changes — and it shares
 * the "dashboard" query-key prefix, so the toolbar's Refresh invalidates it too.
 *
 * The card carries its OWN user dropdown (admins only) rather than relying on
 * the dashboard-wide Owner filter, because prospects are scoped by `savedById`
 * (who captured them) rather than the `ownerId` the rest of the dashboard
 * filters on. Non-admins never see the dropdown — their experience is unchanged.
 *
 * The card DOES follow the dashboard date range: `dashQs` (from/to) is forwarded
 * with applyRange=1 so this funnel windows with every other widget rather than
 * showing an all-time backlog next to filtered cards.
 */
export function ProspectFunnelChart({
  ownerId,
  onOwnerIdChange,
  dashQs,
  tz,
}: {
  /** "" = all users, otherwise a user id. Admin-only; ignored server-side for others. */
  ownerId: string;
  onOwnerIdChange: (next: string) => void;
  /** Active dashboard filter query string (from/to/ownerId). */
  dashQs: string;
  tz: string;
}) {
  // Start from the shared dashboard filters (from/to), then let this card's own
  // savedById picker override the dashboard-wide ownerId, and opt into the
  // server's date filtering with applyRange=1.
  const qs = useMemo(() => {
    const sp = new URLSearchParams(dashQs);
    sp.set("applyRange", "1");
    if (ownerId) sp.set("ownerId", ownerId);
    else sp.delete("ownerId");
    return sp.toString();
  }, [dashQs, ownerId]);

  const { data, isLoading, isError, error } = useQuery<ProspectFunnelDto>({
    queryKey: ["dashboard", "prospect-funnel", qs],
    queryFn: () => fetchProspectFunnel(qs, tz),
    staleTime: 30_000,
    // Prospects are written from outside this page (the browser extension's
    // "Save to CRM", and the Settings → Prospects convert action, which uses
    // router.refresh() and so never touches this cache). refetchOnWindowFocus is
    // off globally, so poll on the same cadence as the rest of the dashboard to
    // pick up creates / status changes / deletions without a manual reload.
    refetchInterval: REFRESH_MS > 0 ? REFRESH_MS : false,
  });

  const canFilter = data?.canFilterByUser ?? false;

  const { data: users = [] } = useQuery<PickerUser[]>({
    queryKey: ["dashboard", "users-picker"],
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000,
    enabled: canFilter,
  });

  if (isLoading) return <ChartCardSkeleton height={300} title="Prospect funnel" />;

  if (isError) {
    return (
      <ChartCard title="Prospect funnel" height={300}>
        <p className="py-8 text-center text-sm text-rose-600">
          {(error as Error)?.message ?? "Failed to load"}
        </p>
      </ChartCard>
    );
  }

  const steps = data?.steps ?? [];
  const total = data?.total ?? 0;
  const isOrgScope = data?.scope === "org";

  const selectedUserName = ownerId
    ? (users.find((u) => u.id === ownerId)?.name ?? "Selected user")
    : null;

  const title = isOrgScope
    ? selectedUserName
      ? `Prospect funnel — ${selectedUserName}`
      : "Prospect funnel"
    : "My prospect funnel";

  const subtitle = isOrgScope
    ? selectedUserName
      ? `${total} prospects saved by ${selectedUserName}`
      : `${total} prospects across the organization`
    : `${total} prospects you saved`;

  // The widest bar defines 100% of the track, so a small stage stays visible
  // instead of collapsing when one stage dominates the distribution.
  const maxCount = steps.reduce((m, s) => Math.max(m, s.count), 0);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      height={300}
      actions={
        canFilter ? (
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-crm-border bg-white px-3 text-xs text-crm-text transition hover:border-accent-300 hover:bg-accent-50">
            <User className="h-3.5 w-3.5 shrink-0 text-crm-muted" aria-hidden />
            <span className="sr-only">Filter prospect funnel by user</span>
            <select
              value={ownerId}
              onChange={(e) => onOwnerIdChange(e.target.value)}
              className="bg-transparent text-xs font-medium text-crm-text focus:outline-none"
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        ) : null
      }
    >
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-crm-muted">
          No prospects yet{selectedUserName ? ` for ${selectedUserName}` : ""}.
        </p>
      ) : (
        <div className="flex h-full flex-col justify-between py-2">
          {steps.map((s, i) => {
            const width = maxCount > 0 ? Math.max(2, (s.count / maxCount) * 100) : 0;
            const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];
            return (
              <div
                key={s.stage}
                className="flex items-center gap-3"
                aria-label={`${s.stage}: ${s.count} prospects (${s.pct}%)`}
              >
                <div className="w-32 shrink-0 truncate text-xs font-medium text-crm-text">
                  {s.stage}
                </div>
                <div className="relative h-7 flex-1 rounded bg-crm-panel">
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-all"
                    style={{ width: `${width}%`, backgroundColor: color }}
                  />
                </div>
                <div className="w-24 shrink-0 text-right text-xs tabular-nums text-crm-text">
                  {s.count} <span className="text-crm-muted">({s.pct}%)</span>
                </div>
              </div>
            );
          })}

          <div className="mt-2 flex items-center justify-between border-t border-crm-border pt-2 text-xs">
            <span className="font-medium text-crm-muted">Total prospects</span>
            <span className="font-semibold tabular-nums text-crm-text">{total}</span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
