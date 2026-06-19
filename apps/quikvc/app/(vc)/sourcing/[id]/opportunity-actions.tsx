"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OpportunityActions({
  oppId,
  currentVerticalId,
  currentStatus,
  verticals,
  canConvert,
  convertedApplicationId,
}: {
  oppId: string;
  currentVerticalId: string | null;
  currentStatus: string;
  verticals: { id: string; name: string }[];
  canConvert: boolean;
  convertedApplicationId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verticalId, setVerticalId] = useState(currentVerticalId ?? "");
  const [status, setStatus] = useState(currentStatus);

  async function patch(body: Record<string, unknown>) {
    const r = await fetch(`/api/sourced-opportunities/${oppId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  async function saveVertical(id: string) {
    setBusy("vertical");
    setError(null);
    try {
      const j = await patch({ verticalId: id || null });
      if (!j.success) setError(j.error);
      else router.refresh();
    } finally { setBusy(null); }
  }

  async function saveStatus(s: string) {
    setBusy("status");
    setError(null);
    try {
      const j = await patch({ status: s });
      if (!j.success) setError(j.error);
      else router.refresh();
    } finally { setBusy(null); }
  }

  async function runScore() {
    setBusy("score");
    setError(null);
    try {
      const r = await fetch(`/api/sourced-opportunities/${oppId}/score`, { method: "POST" });
      const j = await r.json();
      if (!j.success) setError(j.error);
      else router.refresh();
    } finally { setBusy(null); }
  }

  async function convert() {
    if (!confirm("Convert this opportunity to a deal at Intake stage?")) return;
    setBusy("convert");
    setError(null);
    try {
      const r = await fetch(`/api/sourced-opportunities/${oppId}/convert`, { method: "POST" });
      const j = await r.json();
      if (!j.success) {
        setError(j.error);
        return;
      }
      router.push(`/deals/${j.data.dealId}`);
    } finally { setBusy(null); }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <p className="text-xs uppercase tracking-wider text-gray-400">Actions</p>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs">
          <span className="text-gray-500">Vertical</span>
          <select
            value={verticalId}
            onChange={(e) => { setVerticalId(e.target.value); saveVertical(e.target.value); }}
            disabled={busy !== null}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">— pick —</option>
            {verticals.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="text-gray-500">Status</span>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); saveStatus(e.target.value); }}
            disabled={busy !== null}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="new">new</option>
            <option value="reviewing">reviewing</option>
            <option value="qualified">qualified</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          disabled={busy !== null}
          onClick={runScore}
          className="text-sm px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "score" ? "Scoring…" : "🤖 Run thesis-fit"}
        </button>
        {convertedApplicationId ? (
          <span className="text-sm px-4 py-2 bg-purple-50 text-purple-700 rounded-lg border border-purple-200">
            Already converted
          </span>
        ) : (
          <button
            type="button"
            disabled={busy !== null || !canConvert}
            onClick={convert}
            title={!canConvert ? "Need email + vertical to convert" : ""}
            className="text-sm px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "convert" ? "Converting…" : "Convert to deal →"}
          </button>
        )}
      </div>
    </section>
  );
}
