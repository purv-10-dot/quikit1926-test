"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Phone, History, FileText, Mail, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActivityRow } from "@/lib/services/activities/to-list-row";

interface Props {
  relatedKind: "Lead" | "Opportunity" | "Contact" | "Account";
  relatedObjectId: string;
  /** Optional label of the related record — only used when launching the
   *  Log Activity modal so it knows which lead is in context. */
  relatedLabel?: string;
  canCreate?: boolean;
  canViewLeads?: boolean;
  pageSize?: number;
}

interface FilterResponse {
  success: true;
  data: { items: ActivityRow[]; total: number; page: number; pageSize: number };
}

function iconFor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("call")) return Phone;
  if (t.includes("email") || t.includes("mail")) return Mail;
  if (t.includes("meeting")) return Calendar;
  if (t.includes("stage") || t.includes("disposition")) return History;
  return FileText;
}

function colorFor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("call")) return "text-emerald-600 bg-emerald-50";
  if (t.includes("email") || t.includes("mail")) return "text-violet-600 bg-violet-50";
  if (t.includes("stage") || t.includes("disposition")) return "text-blue-600 bg-blue-50";
  if (t.includes("followup") || t.includes("follow up")) return "text-amber-600 bg-amber-50";
  return "text-crm-muted bg-crm-panel";
}

export function ActivityTimeline({
  relatedKind,
  relatedObjectId,
  relatedLabel,
  canCreate = false,
  pageSize = 50,
}: Props) {
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Log activity is now a dedicated page (/activities/log). Deep-link with this
  // record pre-linked when its label is known; otherwise open the plain
  // composer — parity with the old modal, which only pre-linked when a label
  // was supplied (and only for the Lead kind).
  const logActivityHref = useMemo(() => {
    if (!relatedLabel) return "/activities/log";
    const qs = new URLSearchParams({
      relatedKind,
      relatedObjectId,
      label: relatedLabel,
    });
    return `/activities/log?${qs.toString()}`;
  }, [relatedKind, relatedObjectId, relatedLabel]);

  const filterBody = useMemo(
    () => ({
      filter: {
        matchMode: "ALL",
        conditions: [
          { field: "relatedKind", operator: "eq", value: relatedKind },
          { field: "relatedObjectId", operator: "eq", value: relatedObjectId },
        ],
      },
      page,
      pageSize,
      sortBy: "occurredAt",
      sortDir: "desc",
    }),
    [relatedKind, relatedObjectId, page, pageSize],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/activities/filter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(filterBody),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to load timeline");
      }
      const body = (await res.json()) as FilterResponse;
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filterBody]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-crm-muted">
          Activity timeline
        </h3>
        {canCreate && (
          <Link href={logActivityHref} className="crm-btn-primary !px-2.5 !py-1.5 text-xs">
            + Log activity
          </Link>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="text-center text-sm text-crm-muted">Loading…</div>
      ) : error ? (
        <div className="text-center text-sm text-red-600">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-crm-border p-6 text-center text-sm text-crm-muted">
          No activity yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const Icon = iconFor(a.type);
            const color = colorFor(a.type);
            return (
              <li
                key={a.id}
                className="flex gap-3 rounded-lg border border-crm-border bg-crm-panel p-3"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color}`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {a.subject || a.type}
                      </div>
                      {a.outcome && (
                        <div className="text-xs text-crm-muted">{a.outcome}</div>
                      )}
                    </div>
                    <div className="whitespace-nowrap text-xs text-crm-muted">
                      {a.when}
                    </div>
                  </div>
                  {a.detailNotes && (
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white px-2 py-1.5 font-sans text-xs text-crm-text">
                      {a.detailNotes}
                    </pre>
                  )}
                  {a.followUpAt && (
                    <div className="mt-1 text-xs text-amber-700">
                      Follow up: {new Date(a.followUpAt).toLocaleString()}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-crm-muted">
                    {a.owner ? `${a.owner} · ` : ""}
                    {a.relatedKind} · {a.relatedLabel}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-crm-muted">
          <span>
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
