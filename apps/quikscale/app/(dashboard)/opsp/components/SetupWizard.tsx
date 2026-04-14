"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";

interface Props {
  /** Called after wizard submit succeeds — passes the created OPSPData fields to the parent */
  onComplete: (data: { title: string; targetYears: number; year: number; quarter: string }) => void;
  fiscalYearStart: number;
  currentFiscalYear: number;
  currentQuarter: string;
}

/**
 * Formats a fiscal year label based on fiscal start month.
 * - fiscalYearStart === 1 (Jan-Dec): "2026"
 * - fiscalYearStart !== 1 (e.g. Apr-Mar): "2026–2027"
 */
function fyLabel(year: number, fiscalYearStart: number): string {
  if (fiscalYearStart === 1) return String(year);
  return `${year}\u2013${year + 1}`;
}

export function OPSPSetupWizard({ onComplete, fiscalYearStart, currentFiscalYear, currentQuarter }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [endYear, setEndYear] = useState<number | null>(null);
  const [quartersInitialized, setQuartersInitialized] = useState<boolean | null>(null); // null = loading
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const startYear = currentFiscalYear;

  // End year options: 3rd, 4th, 5th year from start
  const endYearOptions = [startYear + 2, startYear + 3, startYear + 4];

  // Check if quarters are initialized for the current fiscal year
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/org/quarters?year=${currentFiscalYear}`);
        const json = await res.json();
        if (json.success) {
          const quarters = json.data ?? [];
          setQuartersInitialized(quarters.length > 0);
        } else {
          setQuartersInitialized(false);
        }
      } catch {
        setQuartersInitialized(false);
      }
    })();
  }, [currentFiscalYear]);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "OPSP title is required";
    if (!endYear) errs.endYear = "Please select an end year";
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const targetYears = (endYear! - startYear) + 1;

      // Create the OPSP via PUT (upsert)
      const res = await fetch("/api/opsp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: currentFiscalYear,
          quarter: currentQuarter,
          targetYears,
          bhag: title.trim(), // Store as BHAG initially, or we can add a dedicated title field
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Failed to create OPSP" }));
        throw new Error(json.error || "Failed to create OPSP");
      }

      onComplete({
        title: title.trim(),
        targetYears,
        year: currentFiscalYear,
        quarter: currentQuarter,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create OPSP";
      setErrors({ _: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const isDisabled = quartersInitialized === false;
  const isLoading = quartersInitialized === null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      {/* Overlay — NOT dismissable */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-[520px] max-w-[95vw] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-8 pb-2">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Set up your One-Page Strategic Plan</h2>
          </div>
          {/* X button — navigates back to dashboard (can't bypass setup) */}
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-8 pb-8 pt-4 space-y-5">
          {/* Quarter not initialized warning */}
          {isDisabled && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Initialize your quarter first</p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  Quarters must be set up before creating an OPSP.{" "}
                  <a href="/org-setup/quarters" className="underline font-medium hover:text-amber-800">
                    Go to Quarter Settings
                  </a>
                </p>
              </div>
            </div>
          )}

          {errors._ && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-600">
              {errors._}
            </div>
          )}

          {/* OPSP Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Enter OPSP Title <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.title; return n; }); }}
              placeholder="Enter title"
              disabled={isDisabled || isLoading}
              className={`w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors ${
                errors.title ? "border-red-400" : "border-gray-200"
              } ${isDisabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "bg-white"}`}
            />
            {errors.title && <p className="text-[11px] text-red-500 mt-1">{errors.title}</p>}
          </div>

          {/* Target (3-5 yrs) — capsule-based year range picker */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-sm font-medium text-gray-700">Target (3–5 yrs)</label>
              <div className="group relative">
                <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 bg-gray-900 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg z-10">
                  Click a year capsule to set how far your strategic target extends. Minimum 3 years.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900" />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">
              Click the last year to set your target range ({endYear ? `${(endYear - startYear) + 1} years selected` : "select 3–5 years"})
            </p>

            {/* Duration quick-select: 3yr / 4yr / 5yr */}
            <div className="flex items-center gap-1.5 mb-3">
              {[3, 4, 5].map(dur => {
                const ey = startYear + dur - 1;
                const isActive = endYear === ey;
                return (
                  <button
                    key={dur}
                    type="button"
                    disabled={isDisabled || isLoading}
                    onClick={() => {
                      setEndYear(ey);
                      setErrors(prev => { const n = { ...prev }; delete n.endYear; return n; });
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                      isActive
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {dur} years
                  </button>
                );
              })}
            </div>

            {/* Year capsules — 5 max (startYear through startYear+4) */}
            <div className={`flex flex-wrap gap-2 ${errors.endYear ? "ring-1 ring-red-300 rounded-lg p-2" : ""}`}>
              {Array.from({ length: 5 }, (_, i) => startYear + i).map(y => {
                const isInRange = endYear !== null && y >= startYear && y <= endYear;
                const isEnd = y === endYear;
                const isStart = y === startYear;
                const isClickable = y >= startYear + 2 && y <= startYear + 4; // only 3rd, 4th, 5th are selectable as end
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={isDisabled || isLoading || !isClickable}
                    onClick={() => {
                      if (isClickable) {
                        setEndYear(y);
                        setErrors(prev => { const n = { ...prev }; delete n.endYear; return n; });
                      }
                    }}
                    className={`relative px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                      isInRange
                        ? isEnd
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                        : isClickable
                          ? "bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-600"
                          : "bg-gray-50 text-gray-300 border-gray-100 cursor-default"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span>{fyLabel(y, fiscalYearStart)}</span>
                    {isStart && isInRange && (
                      <span className="block text-[9px] font-normal mt-0.5 opacity-70">Start</span>
                    )}
                    {isEnd && (
                      <span className="block text-[9px] font-normal mt-0.5 opacity-70">End</span>
                    )}
                  </button>
                );
              })}
            </div>
            {errors.endYear && <p className="text-[11px] text-red-500 mt-1">{errors.endYear}</p>}
          </div>

          {/* Goal Year (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Goal Year</label>
            <div className={`px-4 py-2.5 text-sm border border-gray-200 rounded-lg ${
              isDisabled ? "bg-gray-50 text-gray-400" : "bg-gray-50 text-gray-700"
            }`}>
              {fiscalYearStart === 1 ? `FY ${currentFiscalYear}` : `FY ${fyLabel(currentFiscalYear, fiscalYearStart)}`}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">The Financial Year this OPSP is being created for</p>
          </div>

          {/* Quarter (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Quarter <span className="text-red-500">*</span>
            </label>
            <div className={`px-4 py-2.5 text-sm border border-gray-200 rounded-lg ${
              isDisabled ? "bg-gray-50 text-gray-400" : "bg-gray-50 text-gray-700"
            }`}>
              Quarter {currentQuarter.replace("Q", "")}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isDisabled || isLoading || submitting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Setting up...
              </>
            ) : (
              <>
                Get Started
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
