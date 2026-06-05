"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUsers } from "@/lib/hooks/useUsers";
import { cn } from "@/lib/utils";
import { FInput } from "./components/RichEditor";
import { Card } from "./components/Card";
import { populateCatCache } from "./components/category";
import { ActionsModal, RocksModal, KeyThrustsModal, KeyInitiativesModal, AccountabilityModal, QuarterlyPrioritiesModal } from "./components/modals";
import { Eye, Check, AlertTriangle, Loader2, History } from "lucide-react";
import { fiscalYearLabel, getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import { OPSPSetupWizard } from "./components/SetupWizard";
import { ObjectivesSection } from "./components/ObjectivesSection";
import { TargetsSection } from "./components/TargetsSection";
import { GoalsSection } from "./components/GoalsSection";
import { ActionsSection } from "./components/ActionsSection";
import { AccountabilitySection } from "./components/AccountabilitySection";
import { useOPSPForm, type FormData } from "./hooks/useOPSPForm";
import { OPSPPreview } from "./components/OPSPPreview";
import { validateOPSP, backfillPeriods, type ValidationError } from "./lib/validateOPSP";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { EditNoteCard } from "./components/EditNoteCard";
import { OPSPHistoryDrawer } from "./components/OPSPHistoryDrawer";
import { describeSetChange, describeArrChange, getFieldValue, applyFieldPath, type PendingEdit } from "./lib/editLog";
import { useOpspAck } from "@/lib/hooks/useOpspAck";
import { editedFieldPaths, fieldMatchesEdited, editsSince, latestEdit, type EditLogLike } from "@/lib/utils/opspEditHighlight";

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
    save,
    setAutosaveEnabled,
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

  // Re-fetch unlocked quarters when a quarter is finalized here OR a review
  // is submitted elsewhere. Both events unlock the next quarter in the picker.
  useEffect(() => {
    const handler = () => { refreshReviewedQuarters(); };
    window.addEventListener("opsp-review-submitted", handler);
    window.addEventListener("opsp-finalized", handler);
    return () => {
      window.removeEventListener("opsp-review-submitted", handler);
      window.removeEventListener("opsp-finalized", handler);
    };
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
  // RBAC v2: editing the OPSP requires `update`; admins bypass.
  const canUpdateOPSPCreate = myPerms.isAdmin || myPerms.has("OPSP.Create", "update");
  const statusLocked = form.status === "finalized" || form.status === "reviewed";
  // Once the OPSP Review has been submitted (`reviewed`), the OPSP is locked for
  // EVERYONE — even users with `OPSP.History.EditFinalize:update`. Editing it
  // would invalidate a review that's already been finalized against its targets.
  const reviewSubmitted = form.status === "reviewed";
  const isLocked = reviewSubmitted || (statusLocked && !canEditFinalized) || !canUpdateOPSPCreate;
  // Show the blue "review locked" banner ONLY to users who could otherwise edit a
  // finalized OPSP (the same predicate that drives the amber "Editing enabled"
  // banner) — they're the ones who lost edit access because the review was
  // submitted. Everyone else just sees the standard green "Finalized — read-only".
  const reviewLockBanner = reviewSubmitted && canEditFinalized && canUpdateOPSPCreate;

  /* ── Edit-after-finalize change logging ──
     Active only in the amber "Editing enabled" state (finalized, editable, not
     reviewed). Every field change is captured (baseline → latest), shown in a
     note card, and logged with an optional note. Autosave is unchanged. */
  const loggedEdit = statusLocked && !isLocked;
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const pendingRef = useRef<PendingEdit | null>(null);
  // Always-current form (avoids stale closures when committing) + the form
  // snapshot taken when a pending edit starts, so Cancel can revert the unsaved
  // change cleanly (incl. cascade side-effects on grid rows).
  const formRef = useRef(form);
  formRef.current = form;
  const formSnapshotRef = useRef<FormData | null>(null);
  // The DOM element currently ring-highlighted as "being edited" + its viewport
  // rect, used to anchor the overlay note card directly beneath it. The ring
  // class is toggled on the element directly so it survives re-renders (field
  // classNames are static); the card overlays (fixed) so it never shifts the form.
  const highlightElRef = useRef<HTMLElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const clearHighlight = () => {
    highlightElRef.current?.classList.remove("opsp-edit-active");
    highlightElRef.current = null;
    setAnchorRect(null);
  };
  const highlightActive = () => {
    const el = typeof document !== "undefined" ? document.activeElement : null;
    if (!(el instanceof HTMLElement)) return;
    if (el !== highlightElRef.current) {
      clearHighlight();
      el.classList.add("opsp-edit-active");
      highlightElRef.current = el;
    }
    setAnchorRect(el.getBoundingClientRect());
  };

  // Keep the overlay card anchored as the page scrolls / resizes while open.
  useEffect(() => {
    if (!pendingEdit) return;
    const reposition = () => {
      const el = highlightElRef.current;
      if (el) setAnchorRect(el.getBoundingClientRect());
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [pendingEdit]);

  // Suspend the debounced autosave while editing a finalized OPSP — changes are
  // committed explicitly via the change-note "Save" button (or auto-committed
  // when switching fields). Draft editing keeps autosave on.
  useEffect(() => {
    setAutosaveEnabled(!loggedEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedEdit]);

  const logChange = (edit: PendingEdit, note: string) =>
    fetch("/api/opsp/edit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: form.year,
        quarter: form.quarter,
        field: edit.field,
        label: edit.label,
        oldValue: edit.oldValue,
        newValue: edit.newValue,
        note: note || undefined,
      }),
    }).catch(() => {});

  // Commit a pending edit: persist the form (autosave is off in this mode) AND
  // log the change. Used by Save and by the auto-commit-on-field-switch path.
  const commitPending = async (edit: PendingEdit, note: string) => {
    await save(formRef.current);
    await logChange(edit, note);
  };

  // Merge consecutive edits to the SAME field (keep the baseline old value, update
  // the new). Switching to a different field auto-commits the previous one
  // (persist + note-less log) so nothing is lost now that autosave is off.
  const captureChange = (desc: PendingEdit | null) => {
    if (!desc) return;
    const prev = pendingRef.current;
    if (prev && prev.field === desc.field) {
      const merged = { ...prev, newValue: desc.newValue };
      pendingRef.current = merged;
      setPendingEdit(merged);
      return;
    }
    if (prev) void commitPending(prev, "");
    // Snapshot the form BEFORE this edit applies (captureChange runs ahead of
    // setForm) so Cancel can restore it exactly.
    formSnapshotRef.current = formRef.current;
    pendingRef.current = desc;
    setPendingEdit(desc);
    highlightActive();
  };

  // note === null → Cancel: discard the unsaved change (revert to snapshot).
  // string → Save: persist the value + log the change with the note.
  const resolvePending = async (note: string | null) => {
    const edit = pendingRef.current;
    const snapshot = formSnapshotRef.current;
    pendingRef.current = null;
    setPendingEdit(null);
    clearHighlight();
    formSnapshotRef.current = null;
    if (!edit) return;
    if (note === null) {
      if (snapshot) setForm(snapshot);
      return;
    }
    setSavingNote(true);
    await commitPending(edit, note);
    setSavingNote(false);
  };

  const set = <K extends keyof FormData>(key: K, value: FormData[K], opts?: { skipLog?: boolean }) => {
    if (isLocked && key !== "status") return; // read-only guard
    if (loggedEdit && key !== "status" && !opts?.skipLog) {
      captureChange(describeSetChange(key as string, form[key], value));
    }
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // Explicit per-field change report — used by components that perform multi-cell
  // writes in one set() (Targets/Goals/Actions "Projected" auto-distributes to
  // period cells; "Category" resets the row). They report the exact field the
  // user edited so the log shows that, not an auto-filled period cell.
  const logEdit = (e: PendingEdit) => {
    if (loggedEdit) captureChange(e);
  };

  const setArr = (key: keyof FormData, idx: number, value: string) => {
    if (isLocked) return; // read-only guard
    if (loggedEdit) {
      captureChange(describeArrChange(key as string, idx, (form[key] as string[])[idx], value));
    }
    setForm(prev => {
      const arr = [...(prev[key] as string[])];
      arr[idx] = value;
      return { ...prev, [key]: arr };
    });
  };

  // ── Drawer editing (Edit after Finalize) ──
  // Apply a value edited in the history drawer back into the form (raw set by
  // path — no cascade), persist it explicitly (autosave is off in this mode),
  // and log the change.
  const applyDrawerValue = async (
    field: string,
    label: string,
    oldValue: string,
    newValue: string,
    note: string,
  ) => {
    const nextForm = applyFieldPath(
      formRef.current as unknown as Record<string, unknown>,
      field,
      newValue,
    ) as unknown as FormData;
    setForm(nextForm);
    await save(nextForm);
    await logChange({ field, label, oldValue, newValue }, note);
  };
  // Update an existing log entry's note.
  const editDrawerNote = (id: string, note: string) =>
    fetch("/api/opsp/edit-log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: form.year, quarter: form.quarter, id, note }),
    }).catch(() => {});

  /* ── Finalize ──
     The header pill reflects the OPSP's *status*, not whether the current
     user can edit. An admin with `OPSP.History.EditFinalize:update` may
     still edit a reviewed OPSP, but the pill must continue to read
     "Finalized" so they can see (and not accidentally re-finalize) the
     committed state. */
  const isFinalized = statusLocked;
  const confirmFinalize = async () => {
    await fetch("/api/opsp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: form.year, quarter: form.quarter }),
    });
    // Only flip to "finalized" from "draft" — never downgrade a "reviewed"
    // OPSP back to "finalized". The POST endpoint already guards this with
    // `where: { ..., status: "draft" }`, but the client also needs the
    // guard so the next autosave doesn't PUT status: "finalized" over a
    // server-side "reviewed".
    if (form.status === "draft") set("status", "finalized");
    setFinalizeConfirmOpen(false);
    window.dispatchEvent(new Event("opsp-finalized"));
  };

  /* ── Post-finalize "what changed" highlight ──
     For a finalized OPSP, fetch the edit-log, highlight the changed fields the
     FIRST time each user views them, and let them acknowledge via the History
     drawer footer ("Mark changes as reviewed"). The acknowledgement is stored
     per user/device and re-surfaces when a newer edit lands. */
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "anon";
  const [editLog, setEditLog] = useState<EditLogLike[]>([]);
  // `no-store`: the edit-log is live — never serve a stale cached copy.
  const loadEditLog = useCallback(async () => {
    if (!isFinalized) { setEditLog([]); return; }
    try {
      const res = await fetch(`/api/opsp/edit-log?year=${form.year}&quarter=${form.quarter}`, { cache: "no-store" });
      const j = await res.json();
      if (j?.success) setEditLog(j.data as EditLogLike[]);
    } catch {
      /* transient — keep the previous list */
    }
  }, [isFinalized, form.year, form.quarter]);
  useEffect(() => { void loadEditLog(); }, [loadEditLog, historyOpen]);
  // Refresh when the tab regains focus so a viewer sees new edits re-surface
  // live (e.g. an editor changed more fields in another tab).
  useEffect(() => {
    const onFocus = () => { void loadEditLog(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadEditLog]);
  // The Form's highlight/banner/footer surface only edits made by SOMEONE ELSE
  // — a user doesn't need their own post-finalize edits flagged back to them.
  // (The History drawer still lists the full history, incl. the user's own.)
  const othersEditLog = useMemo(
    () => editLog.filter((e) => e.actorId !== userId),
    [editLog, userId],
  );
  // Acknowledge against the latest of ALL others' edits; scope the highlight +
  // banner to edits made SINCE the last ack, so a new round only flags the
  // fields changed in that round (not everything ever changed after finalize).
  const latestAll = useMemo(() => latestEdit(othersEditLog), [othersEditLog]);
  const { unacknowledged, acknowledge, ackedTs } = useOpspAck(
    userId, form.year, form.quarter, "form", latestAll?.ts ?? 0,
  );
  const newOthers = useMemo(() => editsSince(othersEditLog, ackedTs), [othersEditLog, ackedTs]);
  const latestChange = useMemo(() => latestEdit(newOthers), [newOthers]);
  const editedPaths = useMemo(() => new Set(editedFieldPaths(newOthers)), [newOthers]);
  const showChangedHighlight = isFinalized && unacknowledged && editedPaths.size > 0;

  // Toggle the persistent "changed after finalize" ring on tagged fields. Same
  // imperative pattern as `opsp-edit-active`; distinct class so the two never clash.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const els = document.querySelectorAll<HTMLElement>("[data-opsp-field]");
    els.forEach((el) => {
      const matched = showChangedHighlight && fieldMatchesEdited(el.dataset.opspField ?? "", editedPaths);
      el.classList.toggle("opsp-edit-changed", matched);
    });
    return () => {
      document
        .querySelectorAll<HTMLElement>(".opsp-edit-changed")
        .forEach((el) => el.classList.remove("opsp-edit-changed"));
    };
  }, [showChangedHighlight, editedPaths]);

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

                      // A quarter is locked until the prior quarter is
                      // finalized (review submission also counts). Skip the
                      // gate for the plan's first quarter and for quarters
                      // the user is already on / has been on.
                      const isPlanFirst =
                        form.year === planStartYear && qNum === startQNum;
                      const prevYear = qNum === 1 ? form.year - 1 : form.year;
                      const prevQ = qNum === 1 ? "Q4" : `Q${qNum - 1}`;
                      const prevUnlocked = reviewedQuarters.includes(`${prevYear}:${prevQ}`);
                      const isLocked = !isBeforeStart && !isPlanFirst && !prevUnlocked;
                      const disabled = isBeforeStart || isLocked;
                      return (
                        <button key={q}
                          disabled={disabled}
                          title={isLocked ? `Finalize ${prevQ} to unlock ${q}` : undefined}
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
              // Backfill any empty period cells (y/q/m) for rows that have
              // Category + Projected. The matrix modals that used to host
              // manual cell entry were removed, so without this pass Manual
              // categories would always fail validation.
              const filled = backfillPeriods(form);
              if (filled !== form) setForm(filled);
              const errs = validateOPSP(filled);
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
          {isFinalized && (
            <button onClick={() => setHistoryOpen(true)} className="p-1.5 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50" title="Edit history"><History className="h-4 w-4" /></button>
          )}
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
              <p className="text-xs text-red-600 mt-0.5">Review the items below and update each row, or remove rows you don&apos;t need.</p>
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

      {/* ── Modals ──
         readOnly is gated on `isLocked` (not `isFinalized`) so an admin with
         `OPSP.History.EditFinalize:update` can edit modal rows even after the
         OPSP has been finalized/reviewed. */}
      <ActionsModal open={actionsOpen} onClose={() => setActionsOpen(false)}
        rows={form.actionsQtr} onChange={r => set("actionsQtr", r)}
        fiscalYear={form.year} fiscalQuarter={form.quarter}
        goalRows={form.goalRows} readOnly={isLocked} />
      <RocksModal open={rocksOpen} onClose={() => setRocksOpen(false)}
        rows={form.rocks} onChange={r => set("rocks", r)} readOnly={isLocked} />
      <KeyThrustsModal open={keyThrustsOpen} onClose={() => setKeyThrustsOpen(false)}
        rows={form.keyThrusts} onChange={r => set("keyThrusts", r)} readOnly={isLocked} />
      <KeyInitiativesModal open={keyInitiativesOpen} onClose={() => setKeyInitiativesOpen(false)}
        rows={form.keyInitiatives} onChange={r => set("keyInitiatives", r)} readOnly={isLocked} />
      <AccountabilityModal open={kpiAcctOpen} onClose={() => setKpiAcctOpen(false)}
        rows={form.kpiAccountability} onChange={r => set("kpiAccountability", r)} readOnly={isLocked} />
      <QuarterlyPrioritiesModal open={qPrioritiesOpen} onClose={() => setQPrioritiesOpen(false)}
        rows={form.quarterlyPriorities} onChange={r => set("quarterlyPriorities", r)} readOnly={isLocked} />

      {/* ── OPSP Preview (PDF / Word export) ── */}
      <OPSPPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        form={form}
        users={allUsers}
        tenantName={tenantName}
        currentUserName={currentUserName}
      />

      {/* ── Finalized banner ──
         Three variants (in priority order). Note the OPSP is read-only for
         EVERYONE once reviewed; only the banner *copy* depends on permission.
         - `reviewLockBanner` (reviewed AND the user could otherwise edit it):
           blue "review submitted — editing locked" — explains why a user who
           normally could edit a finalized OPSP no longer can.
         - Finalized/locked for everyone else (`isFinalized && isLocked`): green
           "read-only". Covers no-permission users, incl. reviewed ones (who get
           the same standard read-only copy they'd see for any finalized OPSP).
         - Finalized but the user can edit (`isFinalized && !isLocked`): amber
           "you have permission to edit". */}
      {reviewLockBanner && (
        <div className="mx-6 mt-6 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Check className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-800">OPSP Review submitted — editing locked</p>
            <p className="text-xs text-blue-600">This OPSP&apos;s review has been finalized, so the OPSP can no longer be edited.</p>
          </div>
        </div>
      )}
      {isFinalized && isLocked && !reviewLockBanner && (
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
      {isFinalized && !isLocked && (
        <div className="mx-6 mt-6 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <Check className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">OPSP Finalized — Editing enabled</p>
            <p className="text-xs text-amber-600">You have permission to edit this finalized OPSP. Changes will be autosaved.</p>
          </div>
        </div>
      )}

      {/* ── "Edited after finalize" notice ──
         Shown the first time a user views post-finalize changes (until they
         acknowledge via the History drawer footer). The changed fields are
         ringed in amber below. Tells read-only viewers WHO changed it and how
         to inspect the changes. */}
      {showChangedHighlight && (
        <div className="mx-6 mt-3 flex items-center justify-between gap-3 px-4 py-3 bg-amber-50/70 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <History className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800 truncate">
                This OPSP was edited after it was finalized
                {latestChange?.actorName ? ` by ${latestChange.actorName}` : ""}
              </p>
              <p className="text-xs text-amber-600">The changed fields are highlighted below — open History to review them.</p>
            </div>
          </div>
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
          >
            <History className="h-3.5 w-3.5" /> Open History
          </button>
        </div>
      )}

      <div className={cn("px-6 py-6 space-y-8", isLocked && "opsp-finalized")}>

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
                    {[0,1,2].map(i => <div key={i} data-opsp-field={`${key}.${i}`}><FInput value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} /></div>)}
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
              logEdit={logEdit}
              onExpandKeyThrusts={() => setKeyThrustsOpen(true)}
            />

            <GoalsSection
              form={form}
              set={set}
              logEdit={logEdit}
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
                  {[0,1,2].map(i => <div key={i} data-opsp-field={`${key}.${i}`}><FInput value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} /></div>)}
                </Card>
              </div>
            ))}
          </div>        </div>

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
                  {[0,1,2].map(i => <div key={i} data-opsp-field={`${key}.${i}`}><FInput value={(form[key] as string[])[i]} onChange={v => setArr(key, i, v)} /></div>)}
                </Card>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">

            <ActionsSection
              form={form}
              set={set}
              logEdit={logEdit}
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
                    return <div key={row} data-opsp-field={`trends.${idx}`}><FInput value={form.trends[idx] ?? ""} onChange={v => {
                      const next = [...form.trends]; next[idx] = v; set("trends", next);
                    }} /></div>;
                  })}
                </Card>
              ))}
            </div>
          </div>        </div>

      </div>

      {/* Edit-after-finalize: overlay note card anchored beneath the edited
          field (fixed → never shifts the form), plus the history drawer. */}
      {pendingEdit && anchorRect && (() => {
        const vh = typeof window !== "undefined" ? window.innerHeight : 9999;
        const vw = typeof window !== "undefined" ? window.innerWidth : 9999;
        const estH = 210;
        const below = anchorRect.bottom + 6;
        const top = below + estH > vh ? Math.max(8, anchorRect.top - estH - 6) : below;
        const width = Math.max(320, Math.min(anchorRect.width, 440));
        const left = Math.max(8, Math.min(anchorRect.left, vw - width - 8));
        return (
          <div className="fixed z-[60]" style={{ top, left, width }}>
            <EditNoteCard
              pending={pendingEdit}
              saving={savingNote}
              onSave={(n) => void resolvePending(n)}
              onCancel={() => void resolvePending(null)}
            />
          </div>
        );
      })()}
      <OPSPHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        year={form.year}
        quarter={form.quarter}
        canEdit={loggedEdit}
        currentValue={(f) => getFieldValue(form as unknown as Record<string, unknown>, f)}
        onApplyValue={applyDrawerValue}
        onEditNote={editDrawerNote}
        ackFooter={
          isFinalized && othersEditLog.length > 0
            ? { acknowledged: !unacknowledged, onAcknowledge: acknowledge, actorName: latestChange?.actorName }
            : undefined
        }
      />
    </div>
  );
}
