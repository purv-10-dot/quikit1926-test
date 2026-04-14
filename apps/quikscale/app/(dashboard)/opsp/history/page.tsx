"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, ChevronDown, FileText, AlertCircle } from "lucide-react";

interface OPSPRecord {
  id: string;
  userId: string;
  year: number;
  quarter: string;
  status: string;
  targetYears: number;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; firstName: string; lastName: string } | null;
}

/**
 * Formats fiscal year label based on fiscal start month.
 * - fiscalYearStart === 1 (Jan–Dec): "2026"
 * - fiscalYearStart !== 1 (e.g. Apr–Mar): "2026–2027"
 */
function fyLabel(year: number, fiscalYearStart: number): string {
  if (fiscalYearStart === 1) return String(year);
  return `${year}\u2013${year + 1}`;
}

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export default function OPSPHistoryPage() {
  const router = useRouter();

  const [opsps, setOpsps] = useState<OPSPRecord[]>([]);
  const [fiscalYearStart, setFiscalYearStart] = useState<number>(1);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  // OPSP plan config
  const [hasSetup, setHasSetup] = useState<boolean | null>(null); // null = loading
  const [planStartYear, setPlanStartYear] = useState<number | null>(null);
  const [planEndYear, setPlanEndYear] = useState<number | null>(null);
  const [planStartQuarter, setPlanStartQuarter] = useState<string | null>(null); // e.g. "Q2" if onboarded mid-year

  // Load config + history data
  useEffect(() => {
    (async () => {
      try {
        // 1. Fetch plan config
        const configRes = await fetch("/api/opsp/config");
        if (configRes.ok) {
          const config = await configRes.json();
          if (config.success) {
            setFiscalYearStart(config.fiscalYearStart ?? 1);
            setHasSetup(config.hasSetup ?? false);
            if (config.startYear != null) setPlanStartYear(config.startYear);
            if (config.endYear != null) setPlanEndYear(config.endYear);
            if (config.startQuarter != null) setPlanStartQuarter(config.startQuarter);

            if (!config.hasSetup) {
              setLoading(false);
              return;
            }

            // 2. Fetch history data for the full plan range
            const histRes = await fetch("/api/opsp/history");
            const histJson = await histRes.json();
            if (histJson.success) {
              setOpsps(histJson.data ?? []);
              // Auto-select the start year (current plan start)
              if (config.startYear != null) {
                setSelectedYear(config.startYear);
                setExpandedYears(new Set([config.startYear]));
              }
            }
          }
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Generate display years from plan range
  const displayYears = useMemo(() => {
    if (planStartYear == null || planEndYear == null) return [];
    const years: number[] = [];
    for (let y = planStartYear; y <= planEndYear; y++) years.push(y);
    return years;
  }, [planStartYear, planEndYear]);

  // Group OPSPs by year
  const opspsByYear = useMemo(() => {
    const map: Record<number, Record<string, OPSPRecord>> = {};
    for (const o of opsps) {
      if (!map[o.year]) map[o.year] = {};
      map[o.year][o.quarter] = o;
    }
    return map;
  }, [opsps]);

  function toggleYear(year: number) {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  }

  function handleEdit(year: number, quarter: string) {
    router.push(`/opsp?year=${year}&quarter=${quarter}`);
  }

  function handlePreview(year: number, quarter: string) {
    router.push(`/opsp?year=${year}&quarter=${quarter}&preview=true`);
  }

  const statusBadge = (status: string) => {
    if (status === "finalized") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-700 border border-green-200">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Finalized
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Draft
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-56 bg-gray-100 rounded animate-pulse mt-2" />
        </div>
        <div className="flex-1 px-6 py-6">
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // No setup wizard completed — show empty state
  if (hasSetup === false) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <h1 className="text-base font-semibold text-gray-800">OPSP History</h1>
          <p className="text-xs text-gray-400 mt-0.5">View OPSP data by year and quarter</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="mx-auto w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <AlertCircle className="h-7 w-7 text-gray-300" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">No OPSP data found</h3>
            <p className="text-xs text-gray-400 mb-5">
              Set up your One-Page Strategic Plan first to start tracking OPSP history.
            </p>
            <button
              onClick={() => router.push("/opsp")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              Create OPSP
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-gray-800">OPSP History</h1>
          <p className="text-xs text-gray-400 mt-0.5">View OPSP data by year and quarter</p>
        </div>
      </div>

      {/* Year tabs bar */}
      <div className="px-6 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {displayYears.map(year => {
            const hasData = !!opspsByYear[year] && Object.keys(opspsByYear[year]).length > 0;
            const isSelected = selectedYear === year;
            return (
              <button
                key={year}
                onClick={() => {
                  setSelectedYear(year);
                  setExpandedYears(new Set([year]));
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-sm"
                    : hasData
                      ? "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                      : "bg-white text-gray-400 border border-gray-100 hover:bg-gray-50"
                }`}
              >
                {fyLabel(year, fiscalYearStart)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {selectedYear === null ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <FileText className="h-10 w-10 text-gray-200" />
            <p className="text-sm">Select a year to view OPSP history</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const year = selectedYear;
              const yearOpsps = opspsByYear[year] ?? {};
              const hasAnyData = Object.keys(yearOpsps).length > 0;
              const isExpanded = expandedYears.has(year);

              return (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Year header */}
                  <button
                    onClick={() => toggleYear(year)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-800">OPSP</span>
                      {hasAnyData && (
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium border border-blue-100">
                          {Object.keys(yearOpsps).length} quarter{Object.keys(yearOpsps).length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 font-medium">{fyLabel(year, fiscalYearStart)}</span>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      <div className="px-5 py-3">
                        <p className="text-[11px] text-gray-400 mb-3">
                          Showing quarters for {fyLabel(year, fiscalYearStart)}
                        </p>
                        <div className="grid grid-cols-4 gap-3">
                          {QUARTERS.map(q => {
                            const opsp = yearOpsps[q];
                            // In the plan's first year, quarters before startQuarter are disabled
                            const qNum = parseInt(q.replace("Q", ""));
                            const startQNum = planStartQuarter ? parseInt(planStartQuarter.replace("Q", "")) : 1;
                            const isBeforeStart = year === planStartYear && qNum < startQNum;

                            if (isBeforeStart) {
                              return (
                                <div
                                  key={q}
                                  className="rounded-lg border border-dashed border-gray-100 bg-gray-50/50 p-4 opacity-60"
                                >
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-xs font-semibold text-gray-400">
                                      Quarter {q.replace("Q", "")}
                                    </h4>
                                  </div>
                                  <p className="text-[11px] text-gray-300 italic">
                                    Not available
                                  </p>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={q}
                                className={`rounded-lg border p-4 transition-all ${
                                  opsp
                                    ? "border-gray-200 bg-white shadow-sm hover:shadow-md"
                                    : "border-dashed border-gray-200 bg-gray-50"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-xs font-semibold text-gray-700">
                                    Quarter {q.replace("Q", "")}
                                  </h4>
                                  {opsp && statusBadge(opsp.status)}
                                </div>

                                {opsp ? (
                                  <div>
                                    <div className="space-y-1 mb-4">
                                      {opsp.user && (
                                        <p className="text-[10px] text-gray-400">
                                          By {opsp.user.firstName} {opsp.user.lastName}
                                        </p>
                                      )}
                                      <p className="text-[10px] text-gray-400">
                                        Updated {new Date(opsp.updatedAt).toLocaleDateString("en-US", {
                                          month: "short", day: "numeric", year: "numeric",
                                        })}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handlePreview(year, q)}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                      >
                                        <Eye className="h-3 w-3" />
                                        Preview
                                      </button>
                                      <button
                                        onClick={() => opsp.status !== "finalized" && handleEdit(year, q)}
                                        disabled={opsp.status === "finalized"}
                                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-lg transition-colors ${
                                          opsp.status === "finalized"
                                            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                            : "bg-blue-600 text-white hover:bg-blue-700"
                                        }`}
                                        title={opsp.status === "finalized" ? "OPSP is finalized and cannot be edited" : "Edit this OPSP"}
                                      >
                                        <Pencil className="h-3 w-3" />
                                        Edit
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 italic">
                                    No OPSP for this quarter
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
