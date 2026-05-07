"use client";

/**
 * Shared "Export Data" modal for Daily Huddle + Weekly Meeting.
 *
 * Matches the reference UI: From / To month dropdowns + Select Client
 * dropdown + an Export Data submit button. The parent supplies the client
 * list and an `onSubmit` that performs the actual fetch + xlsx generation
 * — this modal just collects the filter selection and validates it.
 */
import { useEffect, useMemo, useState } from "react";
import { Calendar, Download, Users, X } from "lucide-react";

export interface ExportRange {
  /** YYYY-MM-DD UTC of the first day of the From month. */
  from: string;
  /** YYYY-MM-DD UTC of the last day of the To month (inclusive, 23:59:59.999). */
  to: string;
  /** Selected client id, or null when "all clients" is allowed. */
  clientId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Clients list — `{ id, name }`. */
  clients: Array<{ id: string; name: string }>;
  /** Pre-select a client when the modal opens. */
  defaultClientId?: string | null;
  /** Allow "All clients" option (defaults to false — single client required). */
  allowAllClients?: boolean;
  /** Called with the selected range. Should perform the actual download. */
  onSubmit: (range: ExportRange) => Promise<void>;
}

const MONTHS = [
  { v: 0, label: "January" }, { v: 1, label: "February" }, { v: 2, label: "March" },
  { v: 3, label: "April" },   { v: 4, label: "May" },      { v: 5, label: "June" },
  { v: 6, label: "July" },    { v: 7, label: "August" },   { v: 8, label: "September" },
  { v: 9, label: "October" }, { v: 10, label: "November" }, { v: 11, label: "December" },
];

export function ExportDataModal({
  open,
  onClose,
  clients,
  defaultClientId,
  allowAllClients = false,
  onSubmit,
}: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();
  // Offer the previous, current, and next 5 years as a sane window.
  const years = useMemo(
    () => Array.from({ length: 7 }, (_, i) => currentYear - 1 + i),
    [currentYear],
  );

  const [fromYear, setFromYear] = useState(currentYear);
  const [fromMonth, setFromMonth] = useState(now.getMonth());
  const [toYear, setToYear] = useState(currentYear);
  const [toMonth, setToMonth] = useState(now.getMonth());
  const [clientId, setClientId] = useState<string>(defaultClientId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the client when the modal re-opens with a new default.
  useEffect(() => {
    if (open) {
      setClientId(defaultClientId ?? "");
      setError(null);
    }
  }, [open, defaultClientId]);

  if (!open) return null;

  const fromDate = new Date(Date.UTC(fromYear, fromMonth, 1));
  const toDate = new Date(Date.UTC(toYear, toMonth + 1, 0, 23, 59, 59, 999));
  const rangeInvalid = fromDate.getTime() > toDate.getTime();

  async function handleExport() {
    if (rangeInvalid) {
      setError("From month must be before To month.");
      return;
    }
    if (!allowAllClients && !clientId) {
      setError("Please select a client.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
        clientId: clientId || null,
      });
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Export failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Download className="h-4 w-4 text-gray-500" />
            Export Data
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          {/* Client */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-gray-400" />
              Select Client
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              <option value="">{allowAllClients ? "All clients" : "Select a client"}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              Month Range
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gray-500 mb-1">From</p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={fromYear}
                    onChange={(e) => setFromYear(parseInt(e.target.value, 10))}
                    className="px-2 py-2 text-xs border border-gray-200 rounded-md bg-white"
                  >
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select
                    value={fromMonth}
                    onChange={(e) => setFromMonth(parseInt(e.target.value, 10))}
                    className="px-2 py-2 text-xs border border-gray-200 rounded-md bg-white"
                  >
                    {MONTHS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">To</p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={toYear}
                    onChange={(e) => setToYear(parseInt(e.target.value, 10))}
                    className="px-2 py-2 text-xs border border-gray-200 rounded-md bg-white"
                  >
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select
                    value={toMonth}
                    onChange={(e) => setToMonth(parseInt(e.target.value, 10))}
                    className="px-2 py-2 text-xs border border-gray-200 rounded-md bg-white"
                  >
                    {MONTHS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {rangeInvalid && (
              <p className="mt-1 text-[10px] text-red-600">From month must be before To month.</p>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 text-[11px] rounded-md bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-gray-100">
          <button
            onClick={handleExport}
            disabled={busy || rangeInvalid}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            {busy ? "Exporting…" : "Export Data"}
          </button>
        </footer>
      </div>
    </div>
  );
}
