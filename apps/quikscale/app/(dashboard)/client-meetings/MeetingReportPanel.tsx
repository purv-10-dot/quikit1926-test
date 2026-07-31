"use client";

/**
 * Meeting Report panel — the "report view" that replaces the raw transcript in
 * the Export Transcript modal. Generates an AI report on demand, shows section
 * assessments + an overall confidence badge + extracted KPI/Priority/WWW
 * candidates (each with a confidence bar and an "already exists" duplicate
 * badge). Users with the Edit Report permission (`canEdit`) can edit fields,
 * tick which net-new items to create, and Save — which creates the accepted
 * items via the existing create routes, then persists the report.
 */
import { useCallback, useEffect, useState } from "react";
import type { StoredMeetingReport } from "@/lib/ai/meetingReport";
import { kpiPayload, priorityPayload, wwwPayload, quarterOfMonth, resolveOwnerId, type CreateContext, type OwnerUser } from "./reportMapping";

type ItemKind = "kpis" | "priorities" | "wwws";

const pct = (c: number) => `${Math.round(c * 100)}%`;
const confColor = (c: number) => (c >= 0.7 ? "bg-green-500" : c >= 0.4 ? "bg-amber-400" : "bg-red-500");

function ConfidenceBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex items-center gap-2" title={`Confidence ${pct(value)}`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full ${confColor(value)}`} style={{ width: pct(value) }} />
      </div>
      <span className="text-[10px] tabular-nums text-gray-500">{label ?? pct(value)}</span>
    </div>
  );
}

export function MeetingReportPanel({
  transcriptId,
  currentUserId,
}: {
  transcriptId: string;
  currentUserId: string;
}) {
  const now = new Date();
  const [report, setReport] = useState<StoredMeetingReport | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"loading" | "idle" | "generating" | "ready" | "saving">("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [quarter, setQuarter] = useState(quarterOfMonth(now.getMonth() + 1));
  const [year, setYear] = useState(now.getFullYear());
  const [users, setUsers] = useState<OwnerUser[]>([]);

  // Load any previously-saved report for this transcript.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setReport(null);
    setEditing(false);
    setNotice(null);
    (async () => {
      try {
        const res = await fetch(`/api/client-meetings/transcripts/${transcriptId}/report`);
        const json = await res.json();
        if (cancelled) return;
        setCanEdit(Boolean(json?.data?.canEdit));
        if (json?.data?.report) {
          setReport(json.data.report as StoredMeetingReport);
          setStatus("ready");
        } else {
          setStatus("idle");
        }
      } catch {
        if (!cancelled) setStatus("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transcriptId]);

  // Org users, fetched once, for mapping an extracted owner name → a real user.
  // Best-effort: on failure we simply fall back to the current user at save.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users");
        const json = await res.json();
        if (!cancelled && Array.isArray(json?.data)) setUsers(json.data as OwnerUser[]);
      } catch {
        /* keep empty → fallback owner */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(async () => {
    setStatus("generating");
    setNotice(null);
    try {
      const res = await fetch(`/api/client-meetings/transcripts/${transcriptId}/report/generate`, { method: "POST" });
      const json = await res.json();
      const data = json?.data ?? {};
      setCanEdit(Boolean(data.canEdit));
      if (data.aiUnavailable) {
        setNotice("AI is temporarily unavailable — please try again shortly.");
        setStatus("idle");
      } else if (data.reportError) {
        setNotice(`Could not generate a report: ${data.reportError}`);
        setStatus("idle");
      } else if (data.report) {
        setReport(data.report as StoredMeetingReport);
        setStatus("ready");
      } else {
        setNotice(json?.error ?? "Failed to generate report.");
        setStatus("idle");
      }
    } catch (e) {
      setNotice((e as Error).message);
      setStatus("idle");
    }
  }, [transcriptId]);

  // Immutable helpers for editing the in-memory report.
  const patchItem = (kind: ItemKind, idx: number, patch: Record<string, unknown>) => {
    setReport((r) => {
      if (!r) return r;
      const items = [...r.extractedItems[kind]];
      items[idx] = { ...items[idx], ...patch } as never;
      return { ...r, extractedItems: { ...r.extractedItems, [kind]: items } };
    });
  };
  const patchSection = (idx: number, patch: Record<string, unknown>) => {
    setReport((r) => {
      if (!r) return r;
      const sections = [...r.sections];
      sections[idx] = { ...sections[idx], ...patch };
      return { ...r, sections };
    });
  };

  const save = useCallback(async () => {
    if (!report) return;
    setStatus("saving");
    setNotice(null);
    const ctx: CreateContext = {
      ownerId: currentUserId,
      quarter,
      year,
      defaultWhen: new Date().toISOString().slice(0, 10),
    };

    const endpoints: Record<ItemKind, { url: string; payload: (item: never, ctx: CreateContext) => unknown }> = {
      kpis: { url: "/api/kpi", payload: kpiPayload as never },
      priorities: { url: "/api/priority", payload: priorityPayload as never },
      wwws: { url: "/api/www", payload: wwwPayload as never },
    };

    const next = { ...report, extractedItems: { ...report.extractedItems } };
    let created = 0;
    const errors: string[] = [];

    for (const kind of ["kpis", "priorities", "wwws"] as ItemKind[]) {
      const items = [...next.extractedItems[kind]];
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as { accepted?: boolean; duplicate?: unknown; createdRecordId?: string | null };
        // Only create items the user accepted, that aren't duplicates, and
        // that we haven't already created in a prior save.
        if (!item.accepted || item.duplicate || item.createdRecordId) continue;
        // Priorities carry an owner NAME from the transcript — resolve it to a
        // real user id (fallback: current user). KPIs/WWWs use the base ctx.
        const itemCtx: CreateContext =
          kind === "priorities"
            ? { ...ctx, ownerId: resolveOwnerId((item as { owner?: string | null }).owner, users, currentUserId) }
            : ctx;
        try {
          const res = await fetch(endpoints[kind].url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(endpoints[kind].payload(item as never, itemCtx)),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) {
            errors.push(`${kind.slice(0, -1)} "${(item as { name?: string; what?: string }).name ?? (item as { what?: string }).what}": ${json?.error ?? `HTTP ${res.status}`}`);
            continue;
          }
          items[i] = { ...(items[i] as object), createdRecordId: json.data?.id ?? null } as never;
          created += 1;
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      next.extractedItems[kind] = items as never;
    }

    // Persist the report (with createdRecordId annotations) regardless of item outcomes.
    try {
      const res = await fetch(`/api/client-meetings/transcripts/${transcriptId}/report`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        errors.push(`Saving report: ${json?.error ?? `HTTP ${res.status}`}`);
      }
    } catch (e) {
      errors.push((e as Error).message);
    }

    setReport(next);
    setEditing(false);
    setStatus("ready");
    setNotice(
      [created ? `Created ${created} item${created === 1 ? "" : "s"}. Report saved.` : "Report saved.", ...errors]
        .filter(Boolean)
        .join(" "),
    );
  }, [report, transcriptId, currentUserId, quarter, year, users]);

  if (status === "loading") return <p className="text-sm text-gray-400">Loading report…</p>;

  if (!report) {
    return (
      <div className="flex flex-col items-start gap-3">
        {notice ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</div> : null}
        <p className="text-sm text-gray-500">No report has been generated for this meeting yet.</p>
        <button
          onClick={generate}
          disabled={status === "generating"}
          className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {status === "generating" ? "Generating…" : "Generate report"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">Overall confidence</span>
          <ConfidenceBar value={report.overallConfidence} />
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <select value={quarter} onChange={(e) => setQuarter(e.target.value as typeof quarter)} className="rounded-md border border-gray-200 px-2 py-1 text-xs" aria-label="Quarter">
                  {["Q1", "Q2", "Q3", "Q4"].map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
                <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-20 rounded-md border border-gray-200 px-2 py-1 text-xs" aria-label="Year" />
                <button onClick={save} disabled={status === "saving"} className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">
                  {status === "saving" ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="rounded-lg border border-accent-300 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50">Edit report</button>
            )}
          </div>
        ) : (
          <span className="text-[11px] italic text-gray-400">View only</span>
        )}
      </div>

      {notice ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">{notice}</div> : null}

      {report.summary ? <p className="whitespace-pre-wrap text-sm text-gray-700">{report.summary}</p> : null}

      {/* Sections */}
      {report.sections.map((s, i) => (
        <section key={i}>
          <h4 className="mb-1 text-sm font-semibold text-gray-800">{s.heading}</h4>
          {editing ? (
            <textarea
              value={s.body}
              onChange={(e) => patchSection(i, { body: e.target.value })}
              className="w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-700"
              rows={4}
              aria-label={`Edit ${s.heading}`}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-gray-700">{s.body}</p>
          )}
          {s.assessment ? <p className="mt-1 text-xs italic text-gray-500">{s.assessment}</p> : null}
        </section>
      ))}

      {/* Daily adherence table */}
      {report.adherence && report.adherence.length ? (
        <section>
          <h4 className="mb-1 text-sm font-semibold text-gray-800">Adherence</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-accent-50">
                  <th className="px-2 py-1">Participant</th><th className="px-2 py-1">Achievement</th><th className="px-2 py-1">Focus</th><th className="px-2 py-1">Stuck</th><th className="px-2 py-1">Score</th><th className="px-2 py-1">Rating</th>
                </tr>
              </thead>
              <tbody>
                {report.adherence.map((a, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-2 py-1 text-gray-800">{a.participant}{a.role ? ` · ${a.role}` : ""}</td>
                    <td className="px-2 py-1">{a.achievement ?? "—"}</td><td className="px-2 py-1">{a.focus ?? "—"}</td><td className="px-2 py-1">{a.stuck ?? "—"}</td>
                    <td className="px-2 py-1">{a.score ?? "—"}</td><td className="px-2 py-1">{a.rating ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Weekly scorecard */}
      {report.scorecard && report.scorecard.length ? (
        <section>
          <h4 className="mb-1 text-sm font-semibold text-gray-800">Scorecard</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="bg-accent-50"><th className="px-2 py-1">Metric</th><th className="px-2 py-1">Reading</th><th className="px-2 py-1">RAG</th></tr></thead>
              <tbody>
                {report.scorecard.map((s, i) => (
                  <tr key={i} className="border-b border-gray-100"><td className="px-2 py-1 text-gray-800">{s.metric}</td><td className="px-2 py-1">{s.reading}</td><td className="px-2 py-1">{s.rag ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Extracted items */}
      <ExtractedGroup title="KPIs" kind="kpis" items={report.extractedItems.kpis} editing={editing} getLabel={(k) => k.name ?? ""} onToggle={(i, v) => patchItem("kpis", i, { accepted: v })} onRename={(i, v) => patchItem("kpis", i, { name: v })} />
      <ExtractedGroup title="Priorities" kind="priorities" items={report.extractedItems.priorities} editing={editing} getLabel={(p) => p.name ?? ""} onToggle={(i, v) => patchItem("priorities", i, { accepted: v })} onRename={(i, v) => patchItem("priorities", i, { name: v })} />
      <ExtractedGroup title="WWW (action items)" kind="wwws" items={report.extractedItems.wwws} editing={editing} getLabel={(w) => w.what ?? ""} onToggle={(i, v) => patchItem("wwws", i, { accepted: v })} onRename={(i, v) => patchItem("wwws", i, { what: v })} />
    </div>
  );
}

type AnyItem = {
  name?: string;
  what?: string;
  confidence: number;
  duplicate?: { id: string; name: string; ownerName?: string | null } | null;
  accepted?: boolean;
  createdRecordId?: string | null;
};

function ExtractedGroup({
  title,
  kind,
  items,
  editing,
  getLabel,
  onToggle,
  onRename,
}: {
  title: string;
  kind: ItemKind;
  items: AnyItem[];
  editing: boolean;
  getLabel: (i: AnyItem) => string;
  onToggle: (idx: number, v: boolean) => void;
  onRename: (idx: number, v: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section data-testid={`group-${kind}`}>
      <h4 className="mb-1 text-sm font-semibold text-gray-800">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const label = getLabel(item);
          const dup = item.duplicate;
          const created = Boolean(item.createdRecordId);
          return (
            <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                {!dup && !created ? (
                  <input
                    type="checkbox"
                    checked={Boolean(item.accepted)}
                    disabled={!editing}
                    onChange={(e) => onToggle(i, e.target.checked)}
                    className="text-blue-600"
                    aria-label={`Accept ${label}`}
                  />
                ) : null}
                {editing && !created ? (
                  <input value={label} onChange={(e) => onRename(i, e.target.value)} className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-0.5 text-xs" aria-label={`Edit ${label}`} />
                ) : (
                  <span className="truncate text-xs text-gray-800">{label}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {created ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Created</span>
                ) : dup ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800" title={dup.ownerName ?? undefined}>
                    Already exists: {dup.name}
                  </span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">New</span>
                )}
                <ConfidenceBar value={item.confidence} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
