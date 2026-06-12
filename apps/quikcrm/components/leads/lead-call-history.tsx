// apps/quikcrm/components/leads/lead-call-history.tsx
"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils/date-helpers";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

interface CallRow {
  id: string;
  callSid: string | null;
  direction: string | null;
  status: string | null;
  webhookStatus: string | null;
  durationSec: number | null;
  startTime: string | null;
  recordingUrl: string | null;
  sourceNumber: string | null;
  destinationNumber: string | null;
  endedBy: string | null;
}

/**
 * Combine the dialer stub `status` (e.g. "initiated") with the webhook-side
 * `webhookStatus` (e.g. "ANSWER", "busy") so the table shows the real
 * outcome. Webhook value wins because it represents the call's terminal
 * state from the provider.
 */
function effectiveStatus(row: CallRow): string {
  return (row.webhookStatus || row.status || "").trim() || "—";
}

const ENDED_BY_TONE: Record<string, string> = {
  agent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  customer: "bg-blue-50 text-blue-700 ring-blue-200",
  system: "bg-amber-50 text-amber-700 ring-amber-200",
  unknown: "bg-slate-100 text-slate-600 ring-slate-200",
};

const ENDED_BY_LABEL: Record<string, string> = {
  agent: "Agent",
  customer: "Customer",
  system: "System",
  unknown: "Unknown",
};

function EndedByPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-crm-muted">—</span>;
  const tone = ENDED_BY_TONE[value] || ENDED_BY_TONE.unknown;
  const label = ENDED_BY_LABEL[value] || value;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {label}
    </span>
  );
}

export function LeadCallHistory({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/telephony/call-logs?leadId=${leadId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        setRows(Array.isArray(j?.items) ? j.items : []);
      })
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [leadId]);

  if (loading) return <p className="py-8 text-center text-sm text-crm-muted">Loading…</p>;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-crm-muted">No calls yet.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <TR>
            <TH>Started</TH>
            <TH>Direction</TH>
            <TH>From</TH>
            <TH>To</TH>
            <TH>Status</TH>
            <TH className="text-right">Duration</TH>
            <TH>Ended by</TH>
            <TH>Recording</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((c) => (
            <TR key={c.id}>
              <TD>{formatDateTime(c.startTime)}</TD>
              <TD>{c.direction || "—"}</TD>
              <TD>{c.sourceNumber || "—"}</TD>
              <TD>{c.destinationNumber || "—"}</TD>
              <TD>{effectiveStatus(c)}</TD>
              <TD className="text-right">{c.durationSec ? `${c.durationSec}s` : "—"}</TD>
              <TD>
                <EndedByPill value={c.endedBy} />
              </TD>
              <TD>
                {c.recordingUrl ? (
                  <a className="crm-link text-xs" href={c.recordingUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  "—"
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
