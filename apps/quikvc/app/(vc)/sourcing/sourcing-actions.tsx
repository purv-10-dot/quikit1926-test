"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Sourcing actions — manual add modal + CSV import.
 *
 * CSV format: headers required: startupName,contactName,contactEmail,
 *   contactPhone,website,fundingAskLakhs,pitch
 * Empty values OK. Uses naive comma-split — quoted commas are not handled
 * (good enough for v1; swap to papaparse later if needed).
 */
export default function SourcingActions() {
  const router = useRouter();
  const [open, setOpen] = useState<"manual" | "csv" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual form state
  const [startupName, setStartupName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [fundingAskLakhs, setFundingAskLakhs] = useState<number | "">("");
  const [pitch, setPitch] = useState("");

  // CSV state
  const [csv, setCsv] = useState("");

  function reset() {
    setStartupName(""); setContactName(""); setContactEmail("");
    setWebsite(""); setFundingAskLakhs(""); setPitch("");
    setCsv(""); setError(null);
  }

  async function submitManual() {
    if (!startupName.trim()) {
      setError("Startup name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/sourced-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startupName: startupName.trim(),
          contactName: contactName.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          website: website.trim() || undefined,
          fundingAskLakhs: fundingAskLakhs === "" ? undefined : Number(fundingAskLakhs),
          pitch: pitch.trim() || undefined,
          source: "manual",
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      reset();
      setOpen(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitCsv() {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) {
      setError("CSV needs a header row + at least one data row");
      return;
    }
    const headers = lines[0].split(",").map((h) => h.trim());
    const items = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ""; });
      return {
        startupName: row.startupName,
        contactName: row.contactName || undefined,
        contactEmail: row.contactEmail || undefined,
        contactPhone: row.contactPhone || undefined,
        website: row.website || undefined,
        fundingAskLakhs: row.fundingAskLakhs ? parseInt(row.fundingAskLakhs, 10) : undefined,
        pitch: row.pitch || undefined,
        source: "csv" as const,
      };
    }).filter((r) => r.startupName);

    if (items.length === 0) {
      setError("No valid rows found (need startupName)");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/sourced-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      reset();
      setOpen(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { reset(); setOpen("csv"); }}
          className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
        >
          Import CSV
        </button>
        <button
          type="button"
          onClick={() => { reset(); setOpen("manual"); }}
          className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
        >
          + Add opportunity
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {open === "manual" ? "Add opportunity" : "Import CSV"}
              </h2>
              <button onClick={() => setOpen(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="p-5 space-y-3">
              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
              )}
              {open === "manual" ? (
                <>
                  <Field label="Startup name *" value={startupName} onChange={setStartupName} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Contact name" value={contactName} onChange={setContactName} />
                    <Field label="Contact email" value={contactEmail} onChange={setContactEmail} type="email" />
                  </div>
                  <Field label="Website" value={website} onChange={setWebsite} />
                  <label className="block text-xs">
                    <span className="text-gray-500">Funding ask (₹L)</span>
                    <input
                      type="number"
                      value={fundingAskLakhs}
                      onChange={(e) => setFundingAskLakhs(e.target.value === "" ? "" : Number(e.target.value))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-gray-500">Pitch / one-liner</span>
                    <textarea
                      value={pitch}
                      onChange={(e) => setPitch(e.target.value)}
                      rows={3}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={submitManual}
                    className="w-full text-sm px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busy ? "Adding…" : "Add"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500">
                    Required header row:
                    <code className="block mt-1 px-2 py-1 bg-gray-100 rounded text-[11px] font-mono">
                      startupName,contactName,contactEmail,contactPhone,website,fundingAskLakhs,pitch
                    </code>
                  </p>
                  <textarea
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                    rows={10}
                    placeholder="Paste CSV here…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={submitCsv}
                    className="w-full text-sm px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busy ? "Importing…" : "Import"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
      />
    </label>
  );
}
