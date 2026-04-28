"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface MeetingItem {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  meetingUrl: string | null;
  agenda: string | null;
  transcript: {
    status: string;
    analysis: Record<string, unknown> | null;
    tokensUsed: number | null;
  } | null;
}

interface AnalysisShape {
  summary?: string;
  keyPoints?: string[];
  redFlags?: { title: string; description: string; severity: string }[];
  actionItems?: { owner: string; description: string }[];
  sentiment?: string;
}

const TYPE_LABEL: Record<string, string> = {
  "discovery-call": "Discovery call",
  "partner-meeting": "Partner meeting",
  "ic-review": "IC review",
  "follow-up": "Follow-up",
};

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-green-100 text-green-700 border-green-200",
  neutral:  "bg-gray-100 text-gray-700 border-gray-200",
  cautious: "bg-amber-100 text-amber-700 border-amber-200",
  negative: "bg-red-100 text-red-700 border-red-200",
};

export default function MeetingsClient({
  dealId,
  meetings,
}: {
  dealId: string;
  meetings: MeetingItem[];
}) {
  const router = useRouter();
  const [scheduling, setScheduling] = useState(false);
  const [pasteOpen, setPasteOpen] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    type: "discovery-call",
    scheduledAt: "",
    meetingUrl: "",
    agenda: "",
  });

  async function createMeeting() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setSubmitting("create");
    setError(null);
    try {
      const r = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          title: form.title,
          type: form.type,
          scheduledAt: form.scheduledAt
            ? new Date(form.scheduledAt).toISOString()
            : undefined,
          meetingUrl: form.meetingUrl || undefined,
          agenda: form.agenda || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      setScheduling(false);
      setForm({ title: "", type: "discovery-call", scheduledAt: "", meetingUrl: "", agenda: "" });
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  async function submitTranscript(meetingId: string) {
    if (transcriptDraft.trim().length < 50) {
      setError("Transcript too short (≥ 50 chars)");
      return;
    }
    setSubmitting(meetingId);
    setError(null);
    try {
      const r = await fetch(`/api/meetings/${meetingId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: transcriptDraft }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      setPasteOpen(null);
      setTranscriptDraft("");
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Meetings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Schedule meetings and paste transcripts for AI analysis.
          </p>
        </div>
        {!scheduling && (
          <button
            type="button"
            onClick={() => setScheduling(true)}
            className="text-sm px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            + Schedule meeting
          </button>
        )}
      </header>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {scheduling && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Schedule meeting</p>
          <input
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Title (e.g., Discovery call with founder)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="discovery-call">Discovery call</option>
              <option value="partner-meeting">Partner meeting</option>
              <option value="ic-review">IC review</option>
              <option value="follow-up">Follow-up</option>
            </select>
            <input
              type="datetime-local"
              className="text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={form.scheduledAt}
              onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
            />
          </div>
          <input
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Meet/Zoom URL (optional)"
            value={form.meetingUrl}
            onChange={(e) => setForm((f) => ({ ...f, meetingUrl: e.target.value }))}
          />
          <textarea
            rows={2}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Agenda (optional)"
            value={form.agenda}
            onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setScheduling(false)}
              className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting === "create"}
              onClick={createMeeting}
              className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting === "create" ? "Saving…" : "Schedule"}
            </button>
          </div>
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No meetings scheduled yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {meetings.map((m) => {
            const a = (m.transcript?.analysis as AnalysisShape | null) ?? null;
            const isPasting = pasteOpen === m.id;
            return (
              <li key={m.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{m.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {TYPE_LABEL[m.type] ?? m.type} ·{" "}
                      {m.scheduledAt
                        ? new Date(m.scheduledAt).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Unscheduled"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
                      m.status === "completed"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : m.status === "scheduled"
                          ? "bg-blue-100 text-blue-700 border-blue-200"
                          : "bg-gray-100 text-gray-600 border-gray-200",
                    )}
                  >
                    {m.status}
                  </span>
                </div>

                {m.meetingUrl && (
                  <a
                    href={m.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-blue-600 hover:underline"
                  >
                    Open meeting link ↗
                  </a>
                )}

                {m.agenda && (
                  <p className="text-xs text-gray-700 mt-2 bg-gray-50 px-2 py-1 rounded">
                    <strong>Agenda:</strong> {m.agenda}
                  </p>
                )}

                {/* Transcript section */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {a ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-wider text-gray-400">
                          Transcript analysis
                        </p>
                        {a.sentiment && (
                          <span
                            className={cn(
                              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
                              SENTIMENT_BADGE[a.sentiment] ??
                                "bg-gray-100 text-gray-600 border-gray-200",
                            )}
                          >
                            {a.sentiment}
                          </span>
                        )}
                      </div>
                      {a.summary && (
                        <p className="text-sm text-gray-800">{a.summary}</p>
                      )}
                      {!!a.keyPoints?.length && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-700 mt-2">Key points</p>
                          <ul className="list-disc list-inside text-xs text-gray-700 mt-1 space-y-0.5">
                            {a.keyPoints.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!!a.redFlags?.length && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-2">
                          <p className="text-[11px] font-semibold text-red-700">
                            Red flags ({a.redFlags.length}) — auto-added to Risk Register
                          </p>
                          <ul className="list-disc list-inside text-xs text-red-800 mt-1 space-y-0.5">
                            {a.redFlags.map((f, i) => (
                              <li key={i}>
                                <strong>{f.title}:</strong> {f.description}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!!a.actionItems?.length && (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-700 mt-2">Action items</p>
                          <ul className="text-xs text-gray-700 mt-1 space-y-0.5">
                            {a.actionItems.map((it, i) => (
                              <li key={i}>
                                <strong>{it.owner}:</strong> {it.description}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setPasteOpen(m.id)}
                        className="text-[11px] text-blue-600 hover:underline mt-2"
                      >
                        Re-paste transcript →
                      </button>
                    </div>
                  ) : isPasting ? null : (
                    <button
                      type="button"
                      onClick={() => setPasteOpen(m.id)}
                      className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg"
                    >
                      + Paste transcript & analyze
                    </button>
                  )}

                  {isPasting && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        rows={6}
                        autoFocus
                        placeholder="Paste raw transcript text here…"
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                        value={transcriptDraft}
                        onChange={(e) => setTranscriptDraft(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPasteOpen(null);
                            setTranscriptDraft("");
                          }}
                          className="text-[11px] px-2.5 py-1 text-gray-600 hover:bg-gray-100 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={submitting === m.id}
                          onClick={() => submitTranscript(m.id)}
                          className="text-[11px] px-2.5 py-1 bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                        >
                          {submitting === m.id ? "Analyzing…" : "Analyze with Claude"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
