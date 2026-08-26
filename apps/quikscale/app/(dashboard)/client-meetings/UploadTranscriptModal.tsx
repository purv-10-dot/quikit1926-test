"use client";

/**
 * Upload Transcript modal — layered above ExportTranscriptModal. Lets a user
 * attach a `.docx` transcript by hand (client + type + date + file) when no
 * Fathom recording exists for a meeting. The created row is a normal
 * `ClientMeetingTranscript`, so it immediately works with the existing
 * viewer, export, and Gemini report-generation flow.
 */
import { useState } from "react";

interface ClientOpt { id: string; name: string }

interface UploadedTranscript {
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
  rawSegments: { speaker?: string | null; text?: string | null; timestamp?: number | string | null }[] | null;
  matchStatus: string;
  clientName: string | null;
}

export function UploadTranscriptModal({
  clients,
  initialClientId,
  onClose,
  onUploaded,
}: {
  clients: ClientOpt[];
  initialClientId: string;
  onClose: () => void;
  onUploaded: (row: UploadedTranscript) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [clientId, setClientId] = useState(initialClientId || clients[0]?.id || "");
  const [type, setType] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [meetingDate, setMeetingDate] = useState(today);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) {
      setError("Choose a .docx file to upload.");
      return;
    }
    if (!clientId) {
      setError("Choose a client.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("clientId", clientId);
      body.set("type", type);
      body.set("meetingDate", meetingDate);
      if (title.trim()) body.set("title", title.trim());

      const res = await fetch("/api/client-meetings/transcripts/upload", { method: "POST", body });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Upload failed");
      onUploaded(json.data as UploadedTranscript);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-800">Upload Transcript</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs">
              {(["DAILY", "WEEKLY"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 font-medium capitalize ${type === t ? "bg-accent-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {t.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Meeting date</label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to the file name"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Transcript file (.docx)</label>
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600 disabled:opacity-50"
          >
            {submitting ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
