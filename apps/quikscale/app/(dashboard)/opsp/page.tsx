"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUsers } from "@/lib/hooks/useUsers";
import { cn } from "@/lib/utils";
import { FInput } from "./components/RichEditor";
import { Card } from "./components/Card";
import { populateCatCache } from "./components/category";
import { ActionsModal, RocksModal, KeyThrustsModal, KeyInitiativesModal, AccountabilityModal, QuarterlyPrioritiesModal } from "./components/modals";
import { Eye, Check, AlertTriangle, Loader2 } from "lucide-react";
import { fiscalYearLabel, getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import { OPSPSetupWizard } from "./components/SetupWizard";
import { ObjectivesSection } from "./components/ObjectivesSection";
import { TargetsSection } from "./components/TargetsSection";
import { GoalsSection } from "./components/GoalsSection";
import { ActionsSection } from "./components/ActionsSection";
import { AccountabilitySection } from "./components/AccountabilitySection";
import { useOPSPForm, type FormData } from "./hooks/useOPSPForm";
import { OPSPPreview } from "./components/OPSPPreview";
import { validateOPSP, type ValidationError } from "./lib/validateOPSP";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

/* ═══════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════ */
export default function OPSPPage() {
  const searchParams = useSearchParams();
  const urlYear = searchParams.get("year");
  const urlQuarter = searchParams.get("quarter");
  const urlPreview = searchParams.get("preview") === "true";

  // Form state + autosave + cascade + setup-wizard gating all live in the hook.
  // See apps/quikscale/app/(dashboard)/opsp/hooks/useOPSPForm.ts.
  const {
    form, setForm,
    saveState, loading,
    fiscalYearStart,
    planStartYear, planEndYear, planStartQuarter,
    reviewedQuarters, refreshReviewedQuarters,
    showSetupWizard,
    loadForPeriod,
    completeSetup,
  } = useOPSPForm({ urlYear, urlQuarter });

  // UI-only state (modal opens, year picker, finalize confirm) stays on the page.
  const [rocksOpen, setRocksOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [keyThrustsOpen, setKeyThrustsOpen] = useState(false);
  const [keyInitiativesOpen, setKeyInitiativesOpen] = useState(false);
  const [kpiAcctOpen, setKpiAcctOpen] = useState(false);
  const [qPrioritiesOpen, setQPrioritiesOpen] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [previewOpen, setPreviewOpen] = useState(urlPreview);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const yearRef = useRef<HTMLDivElement>(null);
  const { data: allUsers = [] } = useUsers();

  // Tenant name + signed-in user name — surfaced in OPSP preview blue bands
  // (Page 1 "Organization:" + Page 2 "Your Name:"). Tenant fetched once on
  // mount; user name comes from the NextAuth session.
  const { data: session } = useSession();
  const currentUserName =
    session?.user?.name ?? session?.user?.email ?? "";
  const [tenantName, setTenantName] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/org/info")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.success && j?.data?.name) setTenantName(j.data.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetch unlocked quarters when a review is submitted in another tab/page
  useEffect(() => {
    const handler = () => { refreshReviewedQuarters(); };
    window.addEventListener("opsp-review-submitted", handler);
    return () => window.removeEventListener("opsp-review-submitted", handler);
  }, [refreshReviewedQuarters]);

  // Close year picker on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) setShowYearPicker(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  /* ── Pre-load category meta cache on mount ── */
  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(j => { if (j.success) populateCatCache(j.data); })
      .catch(() => {});
  }, []);

  /* ── Field helpers ──
     "reviewed" is a stronger lock than "finalized" — once the OPSP review has
     been submitted, the form remains read-only and is still presented as
     "Finalized" in the header (a reviewed OPSP is by definition finalized).
     v2: a user with OPSP.History.EditFinalize:update can edit even
     finalized/reviewed OPSPs (the History page Edit button stays enabled). */
  const myPerms = useMyPermissions();
  const canEditFinalized = myPerms.has("OPSP.History.EditFinalize", "update");
  const statusLocked = form.status === "finalized" || form.status === "reviewed";
  const isLocked = statusLocked && !canEditFinalized;

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    if (isLocked && key !== "status") return; // read-only guard
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const setArr = (key: keyof FormData, idx: number, value: string) => {
    if (isLocked) return; // read-only guard
    setForm(prev => {
      const arr = [...(prev[key] as string[])];
      arr[idx] = value;
      return { ...prev, [key]: arr };
    });
  };

  /* ── Finalize ── */
  const isFinalized = isLocked;
  const confirmFinalize = async () => {
    await fetch("/api/opsp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: form.year, quarter: form.quarter }),
    });
    set("status", "finalized");
    setFinalizeConfirmOpen(false);
    window.dispatchEvent(new Event("opsp-finalized"));
  };

  /* ── Header save indicator ── */
  const SaveBadge = () => {
    if (saveState === "saving") return <span className="flex items-center gap-1 text-xs text-gray-400"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>;
    if (saveState === "saved")  return <span className="text-xs text-green-600">✓ Saved</span>;
    if (saveState === "error")  return <span className="text-xs text-red-500">Save failed</span>;
    return null;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-accent-600" />
    </div>
  );

  // Show setup wizard if no OPSP exists for this period
  if (showSetupWizard) {
    return (
      <OPSPSetupWizard
        fiscalYearStart={fiscalYearStart}
        currentFiscalYear={getFiscalYear()}
        currentQuarter={getFiscalQuarter()}
        onComplete={completeSetup}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-900">Create OPSP Data</h1>
          <SaveBadge />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={yearRef}>
            <button
              onClick={() => setShowYearPicker(o => !o)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showYearPicker ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {fiscalYearLabel(form.year)} · {form.quarter}
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showYearPicker && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Fiscal Year</p>
                  <div className="grid grid-cols-1 gap-1">
                    {(() => {
                      // Restrict years to the OPSP plan range if available
                      const start = planStartYear ?? form.year - 2;
                      const end = planEndYear ?? form.year + 2;
                      const years: number[] = [];
                      for (let y = start; y <= end; y++) years.push(y);
                      return years;
                    })().map(y => {
                      const currentFY = getFiscalYear();
                      const isCurrentFY = y === currentFY;
                      const isSelected = form.year === y;
                      const isDisabled = !isCurrentFY;
                      return (
                        <button key={y}
                          disabled={isDisabled}
                          onClick={() => { if (!isDisabled) { setForm(prev => ({ ...prev, year: y })); loadForPeriod(y, form.quarter); } }}
                          className={`text-xs px-3 py-1.5 rounded-lg text-left transition-colors ${
                            isSelected
                              ? "bg-gray-900 text-white"
                              : isDisabled
                                ? "text-gray-300 cursor-not-allowed"
                                : "hover:bg-gray-50 text-gray-700"
                          }`}>
                          {fiscalYearLabel(y)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quarter</p>
                  <div className="grid grid-cols-4 gap-1">
                    {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                      // In the plan's first year, quarters before startQuarter are disabled
                      const qNum = parseInt(q.replace("Q", ""));
                      const startQNum = planStartQuarter ? parseInt(planStartQuarter.replace("Q", "")) : 1;
                      const isBeforeStart = form.year === planStartYear && qNum < startQNum;
                      const isSelected = form.quarter === q;

                      // A quarter is locked until the prior quarter's review has
                      // been submitted. Skip the gate for the plan's first quarter
                      // and for quarters the user is already on / has been on.
                      const isPlanFirst =
                        form.year === planStartYear && qNum === startQNum;
                      const prevYear = qNum === 1 ? form.year - 1 : form.year;
                      const prevQ = qNum === 1 ? "Q4" : `Q${qNum - 1}`;
                      const prevReviewed = reviewedQuarters.includes(`${prevYear}:${prevQ}`);
                      const isLocked = !isBeforeStart && !isPlanFirst && !prevReviewed;
                      const disabled = isBeforeStart || isLocked;
                      return (
                        <button key={q}
                          disabled={disabled}
                          title={isLocked ? `Submit ${prevQ} review to unlock ${q}` : undefined}
                          onClick={() => { if (!disabled) { setForm(prev => ({ ...prev, quarter: q })); loadForPeriod(form.year, q); setShowYearPicker(false); } }}
                          className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${
                            isSelected
                              ? "bg-gray-900 text-white"
                              : disabled
                                ? "text-gray-300 border border-gray-100 cursor-not-allowed"
                                : "hover:bg-gray-50 text-gray-700 border border-gray-200"
                          }`}>
                          {q}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => {
              if (isFinalized) return;
              const errs = validateOPSP(form);
              if (errs.length > 0) {
                setValidationErrors(errs);
                return;
              }
              setValidationErrors([]);
              setFinalizeConfirmOpen(true);
            }}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium",
              isFinalized
                ? "border-green-500 text-green-600 bg-green-50 cursor-default"
                : "border-accent-500 text-accent-600 hover:bg-accent-50")}>
            <Check className="h-4 w-4" />
            {isFinalized ? "Finalized" : "Finalize"}
          </button>
          <button onClick={() => setPreviewOpen(true)} className="p-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50" title="Preview OPSP"><Eye className="h-4 w-4" /></button>
        </div>
      </div>

      {/* ── Validation toast (Finalize blocked) ── */}
      {validationErrors.length > 0 && (
        <div className="fixed top-20 right-6 z-[400] w-[420px] max-h-[70vh] overflow-y-auto bg-white border border-red-200 rounded-xl shadow-2xl">
          <div className="flex items-start gap-3 px-4 py-3 border-b border-red-100 bg-red-50 rounded-t-xl">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">Cannot finalize — fix {validationErrors.length} issue{validationErrors.length === 1 ? "" : "s"}</p>
              <p className="text-xs text-red-600 mt-0.5">Projection vs breakdown sums and missing owners must be resolved.</p>
            </div>
            <button
              onClick={() => setValidationErrors([])}
              className="p-1 rounded hover:bg-red-100 text-red-500 flex-shrink-0"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <ul className="px-4 py-3 space-y-2">
            {(() => {
              const grouped: Record<string, ValidationError[]> = {};
              for (const e of validationErrors) {
                if (!grouped[e.section]) grouped[e.section] = [];
                grouped[e.section].push(e);
              }
              return Object.entries(grouped).map(([section, errs]) => (
                <li key={section}>
                  <p className="text-xs font-semibold text-gray-800 uppercase tracking-wide">{section}</p>
                  <ul className="mt-1 ml-3 space-y-0.5">
                    {errs.map((e, i) => (
                      <li key={i} className="text-xs text-red-700 leading-relaxed">• {e.message}</li>
                    ))}
                  </ul>
                </li>
              ));
            })()}
          </ul>
        </div>
      )}

      {/* ── Finalize confirmation ── */}
      {finalizeConfirmOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Finalize OPSP?</p>
                <p className="text-sm text-gray-500 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Once finalized, all fields will become <span className="font-medium text-gray-800">read-only</span> and
              no further edits can be made to this quarter&apos;s OPSP. The data will be used in your OPSP Review.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setFinalizeConfirmOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmFinalize}
                className="flex-1 px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700"
              >
                Yes, Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <ActionsModal open={actionsOpen} onClose={() => setActionsOpen(false)}
        rows={form.actionsQtr} onChange={r => set("actionsQtr", r)}
        fiscalYear={form.year} fiscalQuarter={form.quarter}
        goalRows={form.goalRows} readOnly={isFinalized} />
      <RocksModal open={rocksOpen} onClose={() => setRocksOpen(false)}
        rows={form.rocks} onChange={r => set("rocks", r)} readOnly={isFinalized} />
      <KeyThrustsModal open={keyThrustsOpen} onClose={() => setKeyThrustsOpen(false)}
        rows={form.keyThrusts} onChange={r => set("keyThrusts", r)} readOnly={isFinalized} />
      <KeyInitiativesModal open={keyInitiativesOpen} onClose={() => setKeyInitiativesOpen(false)}
        rows={form.keyInitiatives} onChange={r => set("keyInitiatives", r)} readOnly={isFinalized} />
      <AccountabilityModal open={kpiAcctOpen} onClose={() => setKpiAcctOpen(false)}
        rows={form.kpiAccountability} onChange={r => set("kpiAccountability", r)} readOnly={isFinalized} />
      <QuarterlyPrioritiesModal open={qPrioritiesOpen} onClose={() => setQPrioritiesOpen(false)}
        rows={form.quarterlyPriorities} onChange={r => set("quarterlyPriorities", r)} readOnly={isFinalized} />

      {/* ── OPSP Preview (PDF / Word export) ── */}
      <OPSPPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        form={form}
        users={allUsers}
        tenantName={tenantName}
        currentUserName={currentUserName}
      />

      {/* ── Finalized read-only banner ── */}
      {isFinalized && (
        <div className="mx-6 mt-6 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">OPSP Finalized</p>
            <p className="text-xs text-green-600">This OPSP has been finalized and is now read-only. All data is locked.</p>
          </div>
        </div>
      )}

      <div className={cn("px-6 py-6 space-y-8", isFinalized && "opsp-finalized")}>

        {/* ══════════════════════════ PEOPLE ══════════════════════════ */}
        <div>
          <div className="mb-4">
            <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">PEOPLE</p>
            <p className="text-xs text-gray-500">(Reputation Drivers)</p>
          </div>

          {/* 3-col people */}
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-4 mb-4" style={{ minWidth: 720 }}>
              {(["employees","customers","shareholders"] as const).map((key, ci) => (
                <div key={key} className="flex-1 min-w-[220px]">
                  <p className="text-sm font-medium text-gray-700 mb-2 capitalize">{["Employees","Customers","Shareholders"][ci]}</p>
                  <Card className="space-y-2">
                    {[0,1,2].map(i => <FInput key={i} value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} />)}
                  </Card>
                </div>
              ))}
            </div>
          </div>

          {/* 4-col grid */}
          <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 items-stretch" style={{ minWidth: 1200 }}>

            <ObjectivesSection form={form} set={set} setArr={setArr} />

            <TargetsSection
              form={form}
              set={set}
              onExpandKeyThrusts={() => setKeyThrustsOpen(true)}
            />

            <GoalsSection
              form={form}
              set={set}
              onExpandKeyInitiatives={() => setKeyInitiativesOpen(true)}
            />
          </div>
          </div>{/* end overflow-x-auto */}

          {/* Process + Weaknesses */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            {(["processItems","weaknesses"] as const).map((key, ci) => (
              <div key={key}>
                <p className="text-sm font-medium text-gray-700 mb-2">{["Strengths/Core Competencies","Weaknesses:"][ci]}</p>
                <Card className="space-y-2">
                  {[0,1,2].map(i => <FInput key={i} value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} />)}
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════ PROCESS ══════════════════════════ */}
        <div>
          <div className="mb-4">
            <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">PROCESS</p>
            <p className="text-xs text-gray-500">(Productivity Drivers)</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            {(["makeBuy","sell","recordKeeping"] as const).map((key, ci) => (
              <div key={key}>
                <p className="text-sm font-medium text-gray-700 mb-2">{["Make/Buy","Sell","Record Keeping"][ci]}</p>
                <Card className="space-y-2">
                  {[0,1,2].map(i => <FInput key={i} value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} />)}
                </Card>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">

            <ActionsSection
              form={form}
              set={set}
              onExpandActions={() => setActionsOpen(true)}
              onExpandRocks={() => setRocksOpen(true)}
            />

            <AccountabilitySection
              form={form}
              set={set}
              onExpandKpiAcct={() => setKpiAcctOpen(true)}
              onExpandQPriorities={() => setQPrioritiesOpen(true)}
            />
          </div>

          {/* Trends */}
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Trends</p>
            <div className="grid grid-cols-2 gap-4">
              {[0,1].map(col => (
                <Card key={col} className="space-y-2">
                  {[0,1,2].map(row => {
                    const idx = col * 3 + row;
                    return <FInput key={row} value={form.trends[idx] ?? ""} onChange={v => {
                      const next = [...form.trends]; next[idx] = v; set("trends", next);
                    }} />;
                  })}
                </Card>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
