"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/utils/date-helpers";
import { Button } from "@/components/ui/button";

interface ActivityItem {
  id: string;
  type?: string | null;
  subject?: string | null;
  outcome?: string | null;
  detailNotes?: string | null;
  occurredAt?: string | null;
}

interface CallLogItem {
  id: string;
  status?: string | null;
  durationSec?: number | null;
  startTime?: string | null;
  sourceNumber?: string | null;
  destinationNumber?: string | null;
}

type FeedRow =
  | { kind: "activity"; id: string; at: number; activity: ActivityItem }
  | { kind: "call"; id: string; at: number; call: CallLogItem };

export function LeadCallDispositionTab({
  leadId,
  leadName,
  onAddDisposition,
}: {
  leadId: string;
  leadName: string;
  onAddDisposition?: () => void;
}) {
  const toast = useToast();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [calls, setCalls] = useState<CallLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [aRes, cRes] = await Promise.all([
          fetch(`/api/activities?leadId=${leadId}`, { credentials: "include" }),
          fetch(`/api/telephony/call-logs?leadId=${leadId}`, { credentials: "include" }),
        ]);
        const [aJson, cJson] = await Promise.all([aRes.json(), cRes.json()]);
        if (cancelled) return;
        setActivities(Array.isArray(aJson?.items) ? aJson.items : []);
        setCalls(Array.isArray(cJson?.items) ? cJson.items : []);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load call dispositions");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, toast]);

  const rows = useMemo<FeedRow[]>(() => {
    const out: FeedRow[] = [];
    for (const a of activities) {
      const type = (a.type ?? "").toLowerCase();
      const subject = (a.subject ?? "").toLowerCase();
      const outcome = (a.outcome ?? "").toLowerCase();
      const isDispositionLike =
        type.includes("call") ||
        type.includes("disposition") ||
        subject.includes("call") ||
        subject.includes("disposition") ||
        outcome.includes("call") ||
        outcome.includes("disposition");
      if (!isDispositionLike) continue;
      out.push({
        kind: "activity",
        id: a.id,
        at: a.occurredAt ? new Date(a.occurredAt).getTime() || 0 : 0,
        activity: a,
      });
    }
    for (const c of calls) {
      out.push({
        kind: "call",
        id: c.id,
        at: c.startTime ? new Date(c.startTime).getTime() || 0 : 0,
        call: c,
      });
    }
    out.sort((x, y) => y.at - x.at);
    return out;
  }, [activities, calls]);

  if (loading) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-end">
          <Button size="sm" onClick={onAddDisposition}>
            Add
          </Button>
        </div>
        <p className="py-8 text-center text-sm text-crm-muted">Loading call disposition…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-end">
          <Button size="sm" onClick={onAddDisposition}>
            Add
          </Button>
        </div>
        <p className="py-8 text-center text-sm text-crm-muted">No call disposition entries yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <Button size="sm" onClick={onAddDisposition}>
          Add
        </Button>
      </div>
      <ol className="space-y-3">
        {rows.map((row) =>
          row.kind === "activity" ? (
            <li key={`a:${row.id}`} className="border-l-4 border-emerald-300 bg-emerald-50/50 pl-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Phone size={14} />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-crm-text">
                      Call · {row.activity.subject || row.activity.outcome || "Call disposition"}
                    </div>
                    {row.activity.detailNotes ? (
                      <div className="mt-2 rounded border border-crm-border bg-white px-3 py-2 text-xs text-crm-text whitespace-pre-wrap">
                        {row.activity.detailNotes}
                      </div>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-crm-muted">
                  {formatDateTime(row.activity.occurredAt ?? null)}
                </span>
              </div>
            </li>
          ) : (
            <li key={`c:${row.id}`} className="border-l-4 border-emerald-300 bg-emerald-50/50 pl-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Phone size={14} />
                  </span>
                  <div>
                    <div className="text-sm font-medium text-crm-text">Call · {row.call.status || "completed"}</div>
                    <div className="text-xs text-crm-muted">
                      {row.call.sourceNumber || "—"} → {row.call.destinationNumber || "—"} ·{" "}
                      {row.call.durationSec ? `${row.call.durationSec}s` : "—"}
                    </div>
                    <div className="mt-1 text-xs text-crm-muted">Lead: {leadName}</div>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-crm-muted">{formatDateTime(row.call.startTime ?? null)}</span>
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
