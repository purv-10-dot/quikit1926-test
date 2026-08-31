"use client";

/**
 * Bulk Download Reports — one .zip of every saved report in a range.
 *
 * The dialog's job is to make the download PREDICTABLE before it starts. A zip
 * is opaque, and the reports it can contain are expensive to regenerate, so the
 * two things people get wrong here are asking for a range that holds nothing
 * and asking for one that holds far too much. Both are answered before the
 * button is pressed:
 *
 *   · a live count (`GET` on the same route, metadata only) says exactly how
 *     many reports and how many are not signed off;
 *   · the server's cap is surfaced as a blocking message with the way out,
 *     rather than as a request that dies after ninety seconds.
 *
 * After the download, the response headers say how many of the matched reports
 * were actually rendered — a partial zip announces itself instead of waiting to
 * be discovered.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Package } from "lucide-react";

// From `bulkReportKinds`, never `bulkReportZip`: the zip builder imports docx
// and jszip, and this is a client component.
import {
  BULK_KIND_LABEL,
  BULK_REPORT_KINDS,
  type BulkReportKind,
} from "@/lib/exports/bulkReportKinds";

interface ClientOpt {
  id: string;
  name: string;
}

interface PreviewData {
  total: number;
  unvalidated: number;
  byKind: Partial<Record<BulkReportKind, number>>;
  maxReports: number;
  overLimit: boolean;
}

const ROUTE = "/api/client-meetings/reports/bulk-export";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Range presets.
 *
 * Built from a passed-in "today" so the component is deterministic under test —
 * a preset that silently depended on the wall clock could only ever be asserted
 * against itself.
 */
export function rangePresets(today: Date): { id: string; label: string; from: string; to: string }[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m, 1));
  const monthEnd = new Date(Date.UTC(y, m + 1, 0));
  const prevStart = new Date(Date.UTC(y, m - 1, 1));
  const prevEnd = new Date(Date.UTC(y, m, 0));
  const qStart = new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
  const qEnd = new Date(Date.UTC(y, Math.floor(m / 3) * 3 + 3, 0));
  return [
    { id: "thisMonth", label: "This month", from: iso(monthStart), to: iso(monthEnd) },
    { id: "lastMonth", label: "Last month", from: iso(prevStart), to: iso(prevEnd) },
    { id: "thisQuarter", label: "This quarter", from: iso(qStart), to: iso(qEnd) },
  ];
}

export function BulkDownloadReportsModal({
  clients,
  initialClientId,
  today = new Date(),
  onClose,
}: {
  clients: ClientOpt[];
  initialClientId: string;
  /** Injectable for tests; the presets and default range derive from it. */
  today?: Date;
  onClose: () => void;
}) {
  const presets = useMemo(() => rangePresets(today), [today]);

  const [clientIds, setClientIds] = useState<string[]>(
    initialClientId ? [initialClientId] : clients[0] ? [clients[0].id] : [],
  );
  const [from, setFrom] = useState(presets[0].from);
  const [to, setTo] = useState(presets[0].to);
  const [kinds, setKinds] = useState<BulkReportKind[]>([...BULK_REPORT_KINDS]);
  const [validatedOnly, setValidatedOnly] = useState(false);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ included: number; skipped: number } | null>(null);

  const selectionValid = clientIds.length > 0 && kinds.length > 0 && from <= to;

  const query = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("clientIds", clientIds.join(","));
    qs.set("from", from);
    qs.set("to", to);
    qs.set("kinds", kinds.join(","));
    qs.set("validatedOnly", String(validatedOnly));
    return qs.toString();
  }, [clientIds, from, to, kinds, validatedOnly]);

  /** Refresh the count whenever the selection changes. */
  useEffect(() => {
    if (!selectionValid) {
      setPreview(null);
      return;
    }
    let alive = true;
    setPreviewing(true);
    // The count is advisory, so a failed preview must not block the download —
    // it just leaves the button unlabelled with a number.
    fetch(`${ROUTE}?${query}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setPreview(j?.success ? (j.data as PreviewData) : null);
      })
      .catch(() => {
        if (alive) setPreview(null);
      })
      .finally(() => {
        if (alive) setPreviewing(false);
      });
    return () => {
      alive = false;
    };
  }, [query, selectionValid]);

  const toggleClient = (id: string) =>
    setClientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleKind = (k: BulkReportKind) =>
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const download = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds, from, to, kinds, validatedOnly }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? `Download failed (${res.status})`);
      }

      const included = Number(res.headers.get("X-Bulk-Included") ?? 0);
      const skipped = Number(res.headers.get("X-Bulk-Skipped") ?? 0);
      const disposition = res.headers.get("content-disposition") ?? "";
      const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? "Meeting-Reports.zip";

      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      setResult({ included, skipped });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [clientIds, from, to, kinds, validatedOnly]);

  const countLabel = preview ? `${preview.total} report${preview.total === 1 ? "" : "s"}` : null;
  const blocked = Boolean(preview?.overLimit) || preview?.total === 0;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Bulk download reports"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <Package className="h-4 w-4 text-gray-400" /> Bulk Download Reports
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}
          {result ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              Downloaded {result.included} report{result.included === 1 ? "" : "s"}
              {result.skipped > 0
                ? ` — ${result.skipped} could not be rendered and are listed in manifest.csv.`
                : "."}
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Clients</label>
              <button
                type="button"
                onClick={() =>
                  setClientIds(clientIds.length === clients.length ? [] : clients.map((c) => c.id))
                }
                className="text-[11px] font-medium text-accent-600 hover:underline"
              >
                {clientIds.length === clients.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
              {clients.length === 0 ? (
                <p className="px-1 text-xs text-gray-400">No clients.</p>
              ) : (
                clients.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-1 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-accent-600"
                      checked={clientIds.includes(c.id)}
                      onChange={() => toggleClient(c.id)}
                    />
                    {c.name}
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Date range</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setFrom(p.from);
                    setTo(p.to);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                    from === p.from && to === p.to
                      ? "border-accent-500 bg-accent-50 text-accent-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                aria-label="From date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              />
              <input
                type="date"
                aria-label="To date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              />
            </div>
            {from > to ? (
              <p className="mt-1 text-[11px] text-red-600">
                The start date must not be after the end date.
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Report types</label>
            <div className="grid gap-1">
              {BULK_REPORT_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-accent-600"
                    checked={kinds.includes(k)}
                    onChange={() => toggleKind(k)}
                  />
                  <span>{BULK_KIND_LABEL[k]}</span>
                  {preview?.byKind?.[k] ? (
                    <span className="text-[11px] text-gray-400">· {preview.byKind[k]}</span>
                  ) : null}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-accent-600"
              checked={validatedOnly}
              onChange={(e) => setValidatedOnly(e.target.checked)}
            />
            Signed-off reports only
          </label>
          {validatedOnly ? (
            /*
              Saying this out loud matters: a per-huddle report has no sign-off
              step at all, so filtering on one silently drops every single-huddle
              report — which would read as "that huddle had no report".
            */
            <p className="-mt-2 pl-6 text-[11px] text-gray-500">
              Daily Huddle reports for a single huddle have no sign-off step, so they are
              left out while this is on.
            </p>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {!selectionValid ? (
              <span>Pick at least one client, one report type and a valid range.</span>
            ) : previewing ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Counting…
              </span>
            ) : preview === null ? (
              <span>Could not count the selection — the download will still try.</span>
            ) : preview.overLimit ? (
              <span className="text-red-600">
                {preview.total} reports is over the {preview.maxReports}-report limit for one
                download. Narrow the range or pick fewer clients.
              </span>
            ) : preview.total === 0 ? (
              <span>
                No saved reports in that range. Generate them first, or widen the range.
              </span>
            ) : (
              <span>
                <span className="font-medium text-gray-800">{countLabel}</span> will be zipped as
                PDFs{preview.unvalidated > 0 ? ` · ${preview.unvalidated} not signed off` : ""} ·
                plus manifest.csv
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy || !selectionValid || blocked}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {busy ? "Building zip…" : countLabel ? `Download ${countLabel}` : "Download .zip"}
          </button>
        </div>
      </div>
    </div>
  );
}
