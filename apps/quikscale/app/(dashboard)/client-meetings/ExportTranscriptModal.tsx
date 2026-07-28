"use client";

/**
 * Export Transcript modal — view + download Fathom meeting transcripts that
 * QuikFlow matched into Meeting Rhythm. Daily / Weekly / Month / Unassigned
 * tabs pick the scope; a two-pane layout lists matches on the left and shows
 * the selected transcript (summary, action items, full text) on the right.
 * Download as .docx (server route) or .txt (client-side).
 */
import { useCallback, useEffect, useState } from "react";

interface ClientOpt { id: string; name: string }

interface TranscriptRow {
  id: string;
  clientId: string | null;
  type: "DAILY" | "WEEKLY" | null;
  meetingDate: string | null;
  title: string | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  attendees: { name?: string | null; email?: string | null }[] | null;
  summary: string | null;
  actionItems: { text?: string }[] | null;
  rawText: string | null;
  matchStatus: string;
  clientName: string | null;
}

type Scope = "daily" | "weekly" | "month" | "unassigned";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Monday-start week (Mon..Sun) containing `date`, as ISO yyyy-mm-dd bounds. */
function weekBounds(dateStr: string): { from: string; to: string } {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - dow);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

function monthBounds(year: number, month1: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month1 - 1, 1));
  const to = new Date(Date.UTC(year, month1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "—";
}

function attendeeText(rows: TranscriptRow["attendees"]): string {
  if (!Array.isArray(rows)) return "";
  return rows.map((a) => a?.name || a?.email).filter(Boolean).join(", ");
}

export function ExportTranscriptModal({
  clients,
  initialClientId,
  initialMode,
  onClose,
}: {
  clients: ClientOpt[];
  initialClientId: string;
  initialMode: "daily" | "weekly";
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const [scope, setScope] = useState<Scope>(initialMode === "weekly" ? "weekly" : "daily");
  const [clientId, setClientId] = useState(initialClientId || clients[0]?.id || "");
  const [date, setDate] = useState(today);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [selected, setSelected] = useState<TranscriptRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (scope === "unassigned") {
        qs.set("status", "unassigned");
      } else {
        if (clientId) qs.set("clientId", clientId);
        if (scope === "daily") {
          qs.set("type", "DAILY");
          qs.set("date", date);
        } else if (scope === "weekly") {
          qs.set("type", "WEEKLY");
          const { from, to } = weekBounds(date);
          qs.set("from", from);
          qs.set("to", to);
        } else {
          qs.set("type", "WEEKLY");
          const { from, to } = monthBounds(year, month);
          qs.set("from", from);
          qs.set("to", to);
        }
      }
      const res = await fetch(`/api/client-meetings/transcripts?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load transcripts");
      setRows(json.data as TranscriptRow[]);
      setSelected((json.data as TranscriptRow[])[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [scope, clientId, date, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadTxt = (t: TranscriptRow) => {
    const parts = [
      t.title || "Meeting transcript",
      `Client: ${t.clientName ?? "—"}`,
      `Type: ${t.type ?? "—"}`,
      `Date: ${fmtDate(t.meetingDate)}`,
      `Attendees: ${attendeeText(t.attendees) || "—"}`,
      "",
      t.summary ? `SUMMARY\n${t.summary}\n` : "",
      Array.isArray(t.actionItems) && t.actionItems.length
        ? `ACTION ITEMS\n${t.actionItems.map((a) => `- ${a.text ?? ""}`).join("\n")}\n`
        : "",
      "TRANSCRIPT",
      t.rawText ?? "No transcript text.",
    ];
    const blob = new Blob([parts.join("\n")], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, `${(t.title || t.clientName || "transcript").replace(/[^\w.-]+/g, "_").slice(0, 60)}.txt`);
  };

  const downloadDocx = async (t: TranscriptRow) => {
    setDownloading(true);
    try {
      const res = await fetch("/api/client-meetings/export/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      triggerDownload(blob, `${(t.title || t.clientName || "transcript").replace(/[^\w.-]+/g, "_").slice(0, 60)}.docx`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const tabs: { id: Scope; label: string }[] = [
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "month", label: "Month" },
    { id: "unassigned", label: "Unassigned" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-800">Export Transcript</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-5 py-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setScope(t.id)}
                className={`px-3 py-1.5 font-medium ${scope === t.id ? "bg-accent-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {scope !== "unassigned" && (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {(scope === "daily" || scope === "weekly") && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
          )}
          {scope === "weekly" && (
            <span className="text-[11px] text-gray-500">
              Week {weekBounds(date).from} → {weekBounds(date).to}
            </span>
          )}
          {scope === "month" && (
            <>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
                {[year - 1, year, year + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* Body: list + viewer */}
        <div className="flex min-h-0 flex-1">
          {/* List */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-gray-200">
            {loading ? (
              <p className="p-4 text-xs text-gray-400">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-xs text-gray-400">No transcripts for this selection.</p>
            ) : (
              <ul>
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelected(r)}
                      className={`block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${selected?.id === r.id ? "bg-accent-50" : ""}`}
                    >
                      <p className="truncate text-xs font-medium text-gray-800">{r.title || "Untitled meeting"}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {fmtDate(r.meetingDate)} · {r.type ?? "—"}
                        {r.matchStatus !== "MATCHED" ? ` · ${r.matchStatus.toLowerCase()}` : ""}
                      </p>
                      {scope === "unassigned" && r.clientName ? (
                        <p className="text-[11px] text-gray-400">{r.clientName}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Viewer */}
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {error ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            ) : null}
            {!selected ? (
              <p className="text-sm text-gray-400">Select a transcript to view it.</p>
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900">{selected.title || "Meeting transcript"}</h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {selected.clientName ?? "Unassigned"} · {selected.type ?? "—"} · {fmtDate(selected.meetingDate)}
                      {selected.durationMinutes != null ? ` · ${selected.durationMinutes} min` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => downloadDocx(selected)}
                      disabled={downloading}
                      className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600 disabled:opacity-50"
                    >
                      {downloading ? "…" : "Download .docx"}
                    </button>
                    <button
                      onClick={() => downloadTxt(selected)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      .txt
                    </button>
                  </div>
                </div>

                {attendeeText(selected.attendees) ? (
                  <p className="mb-3 text-xs text-gray-600">
                    <span className="font-medium">Attendees:</span> {attendeeText(selected.attendees)}
                  </p>
                ) : null}

                {selected.summary ? (
                  <section className="mb-4">
                    <h4 className="mb-1 text-sm font-semibold text-gray-800">Summary</h4>
                    <p className="whitespace-pre-wrap text-sm text-gray-700">{selected.summary}</p>
                  </section>
                ) : null}

                {Array.isArray(selected.actionItems) && selected.actionItems.length ? (
                  <section className="mb-4">
                    <h4 className="mb-1 text-sm font-semibold text-gray-800">Action items</h4>
                    <ul className="list-disc pl-5 text-sm text-gray-700">
                      {selected.actionItems.map((a, i) => (
                        <li key={i}>{a.text}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section>
                  <h4 className="mb-1 text-sm font-semibold text-gray-800">Transcript</h4>
                  <pre className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-sans text-sm text-gray-700">
                    {selected.rawText || "No transcript text saved."}
                  </pre>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
