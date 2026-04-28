"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FundProfile {
  fundName: string;
  currency: string;
  icVotingMode: string;
  icQuorum: number;
  icThreshold: string;
  icVisibility: string;
  thesis: string;
  dailyBriefHour: number;
}

export default function ICRulesClient({ initial }: { initial: FundProfile }) {
  const router = useRouter();
  const [s, setS] = useState<FundProfile>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/fund-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error); return; }
      setSavedAt(new Date().toISOString());
      router.refresh();
    } finally { setBusy(false); }
  }

  function update<K extends keyof FundProfile>(k: K, v: FundProfile[K]) {
    setS((curr) => ({ ...curr, [k]: v }));
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-900">Fund</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Fund name" value={s.fundName} onChange={(v) => update("fundName", v)} />
          <Field label="Currency (ISO 4217)" value={s.currency} onChange={(v) => update("currency", v)} />
        </div>
        <label className="block">
          <span className="text-xs text-gray-500">Investment thesis (used by Claude for thesis-fit scoring)</span>
          <textarea
            value={s.thesis}
            onChange={(e) => update("thesis", e.target.value)}
            rows={4}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </label>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-900">IC voting</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-gray-500">Voting mode</span>
            <select
              value={s.icVotingMode}
              onChange={(e) => update("icVotingMode", e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="single">Single (first non-abstain decides)</option>
              <option value="multi">Multi (quorum + threshold)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Visibility</span>
            <select
              value={s.icVisibility}
              onChange={(e) => update("icVisibility", e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="open">Open (voters see each other)</option>
              <option value="anonymous">Anonymous</option>
            </select>
          </label>
          {s.icVotingMode === "multi" && (
            <>
              <label className="block">
                <span className="text-xs text-gray-500">Quorum (min voters)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={s.icQuorum}
                  onChange={(e) => update("icQuorum", parseInt(e.target.value, 10) || 1)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Threshold</span>
                <select
                  value={s.icThreshold}
                  onChange={(e) => update("icThreshold", e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="simple-majority">Simple majority (&gt; 50%)</option>
                  <option value="two-thirds">Two-thirds (≥ 67%)</option>
                  <option value="unanimous">Unanimous (100%)</option>
                </select>
              </label>
            </>
          )}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Daily brief</p>
        <label className="block max-w-xs">
          <span className="text-xs text-gray-500">Send hour (0–23, tenant timezone)</span>
          <input
            type="number"
            min={0}
            max={23}
            value={s.dailyBriefHour}
            onChange={(e) => update("dailyBriefHour", parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
          />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="text-sm px-5 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
        {savedAt && <span className="text-xs text-gray-500">Saved {new Date(savedAt).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
    </label>
  );
}
