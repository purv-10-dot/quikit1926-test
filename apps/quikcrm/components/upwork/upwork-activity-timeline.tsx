"use client";

/**
 * Activity timeline for one captured Upwork job.
 *
 * Reads the SHARED activity feed (`GET /api/activities`) — there is no
 * Upwork-specific activity store. Upwork activities are ordinary CrmActivity
 * rows written as standalone (relatedKind "None"), which means they cannot be
 * addressed by relatedObjectId the way a Lead/Account timeline is. They are
 * instead addressed by their source system plus the job's externalId prefix,
 * which is exactly the pair the writer guarantees (see upwork-activity-types).
 *
 * Visibility note: the endpoint applies the standard activity ACL, under which a
 * restricted (non-admin) user only sees activities they own. So a job captured
 * by someone else can legitimately show an empty timeline — the empty state is
 * worded to not imply the data is missing.
 */

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { formatDateTime } from "@/lib/utils/date-helpers";

interface ActivityItem {
  id: string;
  type: string;
  subject: string | null;
  ownerName: string | null;
  occurredAt: string | null;
  detailNotes: string | null;
}

export function UpworkActivityTimeline({
  sourceSystem,
  externalIdPrefix,
}: {
  sourceSystem: string;
  externalIdPrefix: string;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sourceSystem,
        externalIdPrefix,
        limit: "50",
      });
      const res = await fetch(`/api/activities?${params.toString()}`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((body && body.error) || "Failed to load activities");
      }
      // The endpoint returns both a top-level `items` (legacy consumers) and
      // `data.items`; prefer the newer shape.
      const rows = body?.data?.items ?? body?.items ?? [];
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load activities");
    } finally {
      setLoading(false);
    }
  }, [sourceSystem, externalIdPrefix]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-lg border border-crm-border bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-crm-text">
        <History className="h-4 w-4 text-crm-muted" aria-hidden="true" />
        Activity
      </h2>

      {loading && <p className="text-sm text-crm-muted">Loading activity…</p>}

      {!loading && error && (
        <p className="text-sm text-red-700">{error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-crm-muted">
          No activity visible for this job. Activities logged by other users are
          only shown to them and to administrators.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <ol className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3">
              <div
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-600"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-crm-text">
                  {a.subject || a.type}
                </p>
                {a.detailNotes && (
                  <p className="mt-0.5 text-sm text-crm-muted">{a.detailNotes}</p>
                )}
                <p className="mt-0.5 text-xs text-crm-muted">
                  {formatDateTime(a.occurredAt)}
                  {a.ownerName ? ` · ${a.ownerName}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
