"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { Plus, X, Check, ChevronDown, Sparkles, Trash2, ArrowLeft, ArrowRight, Search as SearchIcon, GripVertical, HelpCircle } from "lucide-react";
import { INDIAN_CITIES } from "@/lib/data/indian-cities";

export interface DeptOption { id: string; name: string; code?: string | null; }
export interface PipelineOption { id: string; name: string; isDefault: boolean; stages: { name: string }[]; }
export interface SkillWeightItem { skill: string; weight: number }
export interface JobLevelOption { id: string; code: string; name: string; slaDays: number }
export interface RecruiterAssignment { employeeId: string; positionsAssigned: number }

export interface EmpOption {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  employeeCode?: string | null;
  jobTitle?: string | null;
  designation?: { title: string } | null;
}


export interface ReqFormShape {
  title: string;
  jobOpeningName: string;
  departmentId: string;
  pipelineId: string;
  positions: number;
  type: string;
  priority: string;
  employmentType: string;
  workLocation: string;
  interviewPanelIds: string[];
  reportingToId: string;
  hiringManagerId: string;
  recruiterId: string;
  jobLevelId: string;
  customSlaDays: number | null;
  customSlaReason: string;
  recruiterAssignments: RecruiterAssignment[];
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  budget: number | null;
  targetJoiningDate: string;
  closedDate: string;
  etaToFillDays: number | null;
  jobGrade: string;
  costCenter: string;
  jobLocation: string;
  jobDuration: string;
  workTimings: string;
  interviewMode: string;
  jobDescription: string;
  requirements: string[];
  niceToHave: string[];
  benefits: string[];
  education: string;
  passingYear: number | null;
  technicalQuestions: string[];
  referralBonusAmount: number | null;
  careerPageVisible: boolean;
  internalPostingOnly: boolean;
  postToJobPortal: boolean;
  responsibilities: string[];
  skillWeights: SkillWeightItem[];
  justification: string;
}

// Shared empty form — reused by the New Requisition modal and the Raise page.
export const emptyReqForm: ReqFormShape = {
  title: "", jobOpeningName: "", departmentId: "", pipelineId: "",
  positions: 1, type: "NewPosition", priority: "Medium",
  employmentType: "FullTime", workLocation: "Office",
  interviewPanelIds: [], reportingToId: "", hiringManagerId: "", recruiterId: "",
  jobLevelId: "", customSlaDays: null, customSlaReason: "", recruiterAssignments: [],
  experienceMin: null, experienceMax: null, salaryMin: null, salaryMax: null, budget: null,
  targetJoiningDate: "", closedDate: "", etaToFillDays: null, jobGrade: "", costCenter: "",
  jobLocation: "", jobDuration: "", workTimings: "", interviewMode: "",
  jobDescription: "", requirements: [], niceToHave: [], benefits: [],
  education: "", passingYear: null, technicalQuestions: [], referralBonusAmount: null, careerPageVisible: true, internalPostingOnly: false, postToJobPortal: false,
  responsibilities: [], skillWeights: [], justification: "",
};

export function toReqPayload(f: ReqFormShape) {
  const s = (v: string) => (v.trim() ? v.trim() : undefined);
  const arr = (a: string[]) => (a.length ? a : undefined);
  const n = (v: number | null) => (v ?? undefined);
  return {
    title: f.title.trim(),
    jobOpeningName: s(f.jobOpeningName),
    departmentId: f.departmentId,
    pipelineId: f.pipelineId,
    positions: f.positions,
    type: f.type,
    priority: f.priority,
    employmentType: f.employmentType,
    workLocation: f.workLocation,
    interviewPanelIds: arr(f.interviewPanelIds),
    reportingToId: s(f.reportingToId),
    hiringManagerId: s(f.hiringManagerId),
    recruiterId: s(f.recruiterId),
    jobLevelId: s(f.jobLevelId),
    customSlaDays: n(f.customSlaDays),
    customSlaReason: s(f.customSlaReason),
    // Always reflects the wizard's current rows (always synced from/to
    // recruiterId, so this covers both the plain single-recruiter case and
    // an explicit multi-recruiter split) — never left stale on edit.
    recruiterAssignments: f.recruiterAssignments.filter((a) => a.employeeId).length
      ? f.recruiterAssignments.filter((a) => a.employeeId)
      : undefined,
    experienceMin: n(f.experienceMin),
    experienceMax: n(f.experienceMax),
    salaryMin: n(f.salaryMin),
    salaryMax: n(f.salaryMax),
    budget: n(f.budget),
    targetJoiningDate: s(f.targetJoiningDate),
    closedDate: s(f.closedDate),
    etaToFillDays: n(f.etaToFillDays),
    jobGrade: s(f.jobGrade),
    costCenter: s(f.costCenter),
    jobLocation: s(f.jobLocation),
    jobDuration: s(f.jobDuration),
    workTimings: s(f.workTimings),
    interviewMode: f.interviewMode ? f.interviewMode : undefined,
    jobDescription: s(f.jobDescription),
    requirements: arr(f.requirements),
    niceToHave: arr(f.niceToHave),
    benefits: arr(f.benefits),
    education: s(f.education),
    passingYear: n(f.passingYear),
    technicalQuestions: arr(f.technicalQuestions),
    referralBonusAmount: n(f.referralBonusAmount),
    careerPageVisible: f.careerPageVisible,
    internalPostingOnly: f.internalPostingOnly,
    postToJobPortal: f.postToJobPortal,
    responsibilities: arr(f.responsibilities),
    skillWeights: f.skillWeights.length ? f.skillWeights : undefined,
    justification: s(f.justification),
  };
}

// ─── Multi-select (Interview Panel) ─────────────────────

interface MSOption { value: string; label: string; description?: string }

function MultiSelect({
  value, onChange, options, placeholder,
}: { value: string[]; onChange: (v: string[]) => void; options: MSOption[]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Dropdown is portaled to <body> so the modal's `overflow-y-auto` can't clip
  // it; we position it manually above the trigger (this field tends to sit
  // low on the form) and keep it in sync on scroll/resize, capping its height
  // to whatever space is actually available above so the full list stays
  // reachable instead of getting cut off by the viewport edge.
  const [rect, setRect] = useState<{ left: number; width: number; maxHeight: number; bottom: number } | null>(null);

  const reposition = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const spaceAbove = r.top - margin;
    setRect({ bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxHeight: Math.max(140, spaceAbove) });
  };

  useEffect(() => {
    if (!open) { setQ(""); return; }
    reposition();
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollResize = () => reposition();
    document.addEventListener("mousedown", onClick);
    window.addEventListener("resize", onScrollResize);
    // capture=true so scrolling inside the modal body also repositions the panel
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
  }, [open]);

  const filtered = q.trim()
    ? options.filter((o) => `${o.label} ${o.description ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    : options;
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const selected = options.filter((o) => value.includes(o.value));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "w-full flex items-center gap-2 border rounded-lg px-3 py-2 text-left text-xs transition",
          open ? "border-green-500 ring-2 ring-green-500/20" : "border-gray-300 hover:border-gray-400",
        )}
      >
        <span className={clsx("flex-1 truncate", value.length ? "text-gray-900" : "text-gray-400")}>
          {value.length === 0 ? (placeholder ?? "Select...") : `${value.length} selected`}
        </span>
        <ChevronDown size={14} className={clsx("text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.slice(0, 6).map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-green-200 text-[11px]">
              {o.label}
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); toggle(o.value); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggle(o.value); } }}
                className="hover:text-green-900 cursor-pointer"><X size={10} /></span>
            </span>
          ))}
          {selected.length > 6 && <span className="text-[11px] text-gray-400 px-1 self-center">+{selected.length - 6} more</span>}
        </div>
      )}

      {open && rect && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed", left: rect.left, width: rect.width, zIndex: 9999,
            maxHeight: rect.maxHeight, display: "flex", flexDirection: "column",
            bottom: rect.bottom,
          }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-gray-100 bg-gray-50 shrink-0">
            <div className="relative">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..."
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500" />
            </div>
          </div>
          <ul className="flex-1 min-h-0 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-gray-400">No matches</li>
            ) : filtered.map((o) => {
              const checked = value.includes(o.value);
              return (
                <li key={o.value}>
                  <button type="button" onClick={() => toggle(o.value)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50">
                    <span className={clsx("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                      checked ? "bg-green-600 border-green-600 text-white" : "border-gray-300")}>
                      {checked && <Check size={11} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-gray-900 truncate">{o.label}</span>
                      {o.description && <span className="block text-[11px] text-gray-500 truncate">{o.description}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Requisition Wizard ─────────────────────────────────

const REQ_STEPS = [
  { id: "basics", label: "Basics", sub: "Role, team and basic details" },
  { id: "team", label: "Team & Pipeline", sub: "" },
  { id: "comp", label: "Compensation & Planning", sub: "Salary, budget and timeline" },
  { id: "role", label: "Role Details", sub: "Job details and requirements" },
  { id: "scorecard", label: "Scorecard & Skills", sub: "" },
] as const;

const reqInput = "w-full border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500";
const reqLabel = "block text-xs font-medium text-gray-700 mb-1.5";
const reqSection = "text-[11px] font-bold uppercase tracking-wide text-gray-400";
// Major section headers within a merged step (Role Details, Team & Pipeline,
// etc.) — colored with the org's accent so they read as real section breaks,
// not just another gray label like reqSection's smaller sub-labels.
const reqSectionAccent = "text-[11px] font-bold uppercase tracking-wide text-accent-600";
const reqDivider = "border-t border-gray-100 mt-5 pt-4";

/** Minimum characters required in the Business Justification field. */
const JUSTIFICATION_MIN = 10;

/** Whole days between Start Date and End Date (YYYY-MM-DD strings), floored at 0. */
function calcEtaDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00").getTime();
  const end = new Date(endDate + "T00:00:00").getTime();
  return Math.max(0, Math.ceil((end - start) / 86400000));
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const errRing = "border-red-400 focus:border-red-500 focus:ring-red-500/20";
const errText = "text-[11px] text-red-600 mt-1";

interface ReqWizardProps {
  form: ReqFormShape;
  setForm: React.Dispatch<React.SetStateAction<ReqFormShape>>;
  isEdit: boolean;
  departments: DeptOption[];
  pipelines: PipelineOption[];
  employees: EmpOption[];
  jobLevels?: JobLevelOption[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  /** Raise mode — shows a required Business Justification field + relabels the submit button. */
  showJustification?: boolean;
  submitLabel?: string;
}

export function RequisitionWizard({ form, setForm, isEdit, departments, pipelines, employees, jobLevels = [], submitting, onCancel, onSubmit, showJustification, submitLabel }: ReqWizardProps) {
  const api = useApiClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [skillDraft, setSkillDraft] = useState("");
  const [weightDraft, setWeightDraft] = useState(7);
  const [generating, setGenerating] = useState(false);

  // Raise mode (People → New Requisition) skips the whole Team & Pipeline step
  // (no Hiring Pipeline / Interview Panel / Reports To / Hiring Manager /
  // Recruiter picker) AND the Compensation & Planning step — the latter would
  // otherwise be nearly empty there (Salary/Budget/Dates are all hidden too),
  // so its one remaining field (Experience) moves into Basics instead. It also
  // folds Scorecard & Skills into the Role Details step's tab — the content
  // itself is unchanged, just no longer a separate step (see the render
  // condition below).
  //
  // The main Recruit → Requisitions flow shows every field too, just grouped
  // into 3 tabs instead of 5: Team & Pipeline folds into Basics, and
  // Scorecard & Skills folds into Role Details (same "no field removed, just
  // regrouped" pattern as raise mode — see the render conditions below).
  const visibleSteps = showJustification
    ? REQ_STEPS.filter((s) => s.id !== "team" && s.id !== "comp" && s.id !== "scorecard")
        .map((s) => (s.id === "role" ? { ...s, label: "Role Details & Scorecard" } : s))
    : REQ_STEPS.filter((s) => s.id !== "team" && s.id !== "scorecard")
        .map((s) =>
          s.id === "basics" ? { ...s, label: "Basics & Team" } :
          s.id === "role" ? { ...s, label: "Role Details & Scorecard" } : s);

  // A pipeline is still required server-side even though raise mode hides the
  // picker — silently default to the org's default pipeline (or the first
  // one, if none is marked default) as soon as the list loads.
  useEffect(() => {
    if (!showJustification || form.pipelineId || pipelines.length === 0) return;
    const def = pipelines.find((p) => p.isDefault) ?? pipelines[0];
    if (def) setForm((p) => ({ ...p, pipelineId: def.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJustification, pipelines, form.pipelineId]);

  // Recruiter split defaults to exactly one row (today's single-recruiter
  // behavior) — seeded once from recruiterId/positions the first time the
  // wizard opens with no rows yet (fresh create, or an older requisition
  // that predates the split feature).
  useEffect(() => {
    if (form.recruiterAssignments.length > 0) return;
    setForm((p) => ({ ...p, recruiterAssignments: [{ employeeId: p.recruiterId, positionsAssigned: p.positions }] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.recruiterAssignments.length, form.recruiterId]);

  // With just one recruiter, "all positions" should never need manual
  // balancing — keep that single row's count glued to the Positions field.
  // Once split across 2+ recruiters, the counts become independently
  // editable and HR balances them by hand.
  useEffect(() => {
    if (form.recruiterAssignments.length !== 1) return;
    if (form.recruiterAssignments[0].positionsAssigned === form.positions) return;
    setForm((p) => ({ ...p, recruiterAssignments: [{ ...p.recruiterAssignments[0], positionsAssigned: p.positions }] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.recruiterAssignments.length, form.positions]);

  // ETA to Fill is auto-calculated from Start Date → End Date. Keep it in sync
  // whenever both dates are present (covers editing older requisitions whose
  // etaToFillDays was never stored, so the field isn't left blank).
  useEffect(() => {
    if (!form.closedDate || !form.targetJoiningDate) return;
    const eta = calcEtaDays(form.closedDate, form.targetJoiningDate);
    if (eta !== form.etaToFillDays) setForm((p) => ({ ...p, etaToFillDays: eta }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.closedDate, form.targetJoiningDate]);

  // End Date defaults to Start Date + the level's standard SLA (or the
  // approved custom ETA, if overridden) — only while End Date is still
  // empty, so this never clobbers a date HR has already picked/edited.
  useEffect(() => {
    if (!form.closedDate || form.targetJoiningDate) return;
    const slaDays = form.customSlaDays ?? jobLevels.find((l) => l.id === form.jobLevelId)?.slaDays;
    if (!slaDays) return;
    setForm((p) => ({ ...p, targetJoiningDate: addDays(form.closedDate, slaDays) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.jobLevelId, form.closedDate, form.customSlaDays]);

  const empOpts: MSOption[] = employees.map((e) => ({
    value: e.id,
    label: (e.displayName?.trim() || `${e.firstName} ${e.lastName}`).trim(),
    description: [e.employeeCode, e.designation?.title || e.jobTitle].filter(Boolean).join(" · ") || undefined,
  }));

  const justificationLen = form.justification.trim().length;
  const justificationOk = !showJustification || justificationLen >= JUSTIFICATION_MIN;
  // Office / Hybrid roles must have a job location (Remote doesn't).
  const jobLocationOk = form.workLocation === "Remote" || form.jobLocation.trim().length > 0;
  // Experience range check — duplicated (not shared with compErrors.exp below)
  // because Basics needs it and compErrors is defined further down; both stay
  // in sync since they encode the same two rules (≤50yrs, min ≤ max).
  const expRangeError = (form.experienceMin ?? 0) > 50 || (form.experienceMax ?? 0) > 50
    || (form.experienceMin != null && form.experienceMax != null && form.experienceMin > form.experienceMax);
  const expFilledIfRaise = !showJustification || (form.experienceMin != null && form.experienceMax != null);
  const canStep1 = form.title.trim().length > 0 && !!form.departmentId && !!form.jobLevelId && justificationOk && jobLocationOk
    && expFilledIfRaise && (!showJustification || !expRangeError);
  // Raise mode never shows this step's fields — hiringManagerId is never
  // collected there, so it can't gate anything. pipelineId is still required,
  // but is auto-filled behind the scenes (see the effect above).
  // Recruiter is no longer set at creation time — it's assigned afterward
  // (a separate flow), so it doesn't gate this step.
  const canStep2 = showJustification ? !!form.pipelineId : !!form.pipelineId && !!form.hiringManagerId;

  // Step 3 (Compensation & Planning) cross-field logic checks.
  const todayStr = new Date().toISOString().slice(0, 10);
  const compErrors = {
    exp: (form.experienceMin ?? 0) > 50 || (form.experienceMax ?? 0) > 50
      ? "Experience can’t exceed 50 years."
      : form.experienceMin != null && form.experienceMax != null && form.experienceMin > form.experienceMax
        ? "Min experience can’t be greater than max." : "",
    salary: form.salaryMin != null && form.salaryMax != null && form.salaryMin > form.salaryMax
      ? "Min salary can’t be greater than max." : "",
    budget: form.budget != null && form.salaryMax != null && form.budget < form.salaryMax
      ? "Budget should be at least the max salary." : "",
    targetJoiningDate: form.targetJoiningDate && form.targetJoiningDate < todayStr
      ? "End Date can’t be in the past."
      : form.targetJoiningDate && form.closedDate && form.targetJoiningDate < form.closedDate
        ? "Should be on or after the Start Date." : "",
    closedDate: form.closedDate && form.closedDate < todayStr
      ? "Start Date can’t be in the past." : "",
  };
  // Experience + salary ranges, plus Start/End Date, are required for NEW
  // requisitions. Edits of older requisitions (created before these fields
  // existed / left blank) aren't forced — mirrors the questionsOk edit
  // exemption below. Cross-field checks (compErrors) are still enforced in
  // step3Valid regardless. Raise mode hides Salary Min/Max/Budget and
  // Start/End Date entirely, so only Experience stays required there.
  const compRequiredFilled = isEdit || (
    form.experienceMin != null && form.experienceMax != null
    && (showJustification || (form.salaryMin != null && form.salaryMax != null && !!form.closedDate && !!form.targetJoiningDate))
  );
  const step3Valid = compRequiredFilled && !compErrors.exp && !compErrors.salary && !compErrors.budget && !compErrors.targetJoiningDate && !compErrors.closedDate;
  // At least one technical question is required for NEW requisitions. Edits of
  // older requisitions (created before this field existed) aren't forced.
  const questionsOk = isEdit || form.technicalQuestions.length > 0;
  const canCreate = canStep1 && canStep2 && step3Valid && questionsOk;

  // Validity keyed by step ID (not position) so it stays correct whichever
  // steps are actually in `visibleSteps` — raise mode drops "team" entirely,
  // so index-based lookups would otherwise point at the wrong step.
  const validById: Record<string, boolean> = {
    // Main flow's "basics" tab now also contains the Team & Pipeline fields
    // (merged), so it can't advance until both are satisfied. Raise mode never
    // merges team in — stays gated on canStep1 alone, unchanged.
    basics: showJustification ? canStep1 : canStep1 && canStep2,
    team: canStep2, comp: step3Valid, role: true, scorecard: true,
  };
  const currentStepId = visibleSteps[step]?.id;

  const next = () => setStep((s) => Math.min(s + 1, visibleSteps.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const canAdvance = currentStepId ? validById[currentStepId] : true;

  // Per-step validity + "can I jump to step i?" — a forward jump is only allowed
  // when EVERY prior step is complete, so users can't skip mandatory steps 1–3
  // by clicking a later step dot.
  const stepValid = (idx: number) => validById[visibleSteps[idx]?.id ?? ""] ?? true;
  const canReachStep = (i: number) => {
    for (let j = 0; j < i; j++) if (!stepValid(j)) return false;
    return true;
  };

  const generate = async () => {
    if (!form.title.trim()) { toast.error("Add a role title first"); return; }
    setGenerating(true);
    try {
      const res = await api.post<{ jobDescription: string; requirements: string[]; niceToHave: string[] }>(
        "/api/v1/hrms/recruit/generate-jd",
        {
          title: form.title,
          experienceMin: form.experienceMin,
          experienceMax: form.experienceMax,
          skills: form.skillWeights.map((s) => s.skill),
          employmentType: form.employmentType,
          workLocation: form.workLocation,
          department: departments.find((d) => d.id === form.departmentId)?.name,
        },
      );
      const d = res.data;
      if (d) {
        setForm((p) => ({
          ...p,
          jobDescription: d.jobDescription || p.jobDescription,
          requirements: d.requirements?.length ? d.requirements : p.requirements,
          niceToHave: d.niceToHave?.length ? d.niceToHave : p.niceToHave,
        }));
        toast.success("Draft generated", "Review and edit the AI-suggested content.");
      }
    } catch (e) {
      toast.error("Generation failed", e instanceof Error ? e.message : undefined);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="w-full">
      {/* Stepper */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
        {visibleSteps.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const reachable = i <= step || canReachStep(i);
          return (
            <div key={s.id} className="flex items-start gap-1 shrink-0">
              <button type="button" disabled={!reachable} onClick={() => reachable && setStep(i)}
                title={reachable ? undefined : "Complete the earlier steps first"}
                className={clsx("flex items-start gap-2 group", !reachable && "cursor-not-allowed opacity-60")}>
                <span className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition shrink-0 mt-0.5",
                  done ? "bg-green-600 text-white" : active ? "bg-green-600 text-white ring-4 ring-green-100" : "bg-gray-200 text-gray-500")}>
                  {done ? <Check size={13} /> : i + 1}
                </span>
                <span className="text-left">
                  <span className={clsx("block text-xs font-semibold whitespace-nowrap", active ? "text-gray-900" : done ? "text-gray-600" : "text-gray-400")}>
                    {s.label}
                  </span>
                  {s.sub && <span className="block text-[10.5px] text-gray-400 whitespace-nowrap">{s.sub}</span>}
                </span>
              </button>
              {i < visibleSteps.length - 1 && <span className={clsx("w-8 h-px mx-1 mt-3", done ? "bg-green-500" : "bg-gray-200")} />}
            </div>
          );
        })}
      </div>

      <div className="min-h-[240px]">
        {/* Step 1 — Basics */}
        {currentStepId === "basics" && (
          <div className="space-y-3">
            <p className={clsx(reqSectionAccent, "mb-1")}>Role Details</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={reqLabel}>Role Title <span className="text-red-500">*</span></label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Software Developer" className={reqInput} />
              </div>
              <div>
                <label className={reqLabel}>Department <span className="text-red-500">*</span></label>
                <Select value={form.departmentId} onChange={(v) => setForm({ ...form, departmentId: v })} searchable
                  placeholder={departments.length === 0 ? "No departments — create under Organization" : "Select department"}
                  options={departments.map((d) => ({ value: d.id, label: d.name, description: d.code ?? undefined }))} />
              </div>
              <div>
                <label className={reqLabel}>Job Opening Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={form.jobOpeningName} onChange={(e) => setForm({ ...form, jobOpeningName: e.target.value })}
                  placeholder="A friendly name for this opening" className={reqInput} />
              </div>
              {(form.workLocation === "Office" || form.workLocation === "Hybrid") && (
                <div>
                  <label className={reqLabel}>Job Location <span className="text-red-500">*</span></label>
                  <Select
                    value={form.jobLocation}
                    onChange={(v) => setForm({ ...form, jobLocation: v })}
                    searchable
                    placeholder="Search city…"
                    options={INDIAN_CITIES.map((c) => ({ value: c, label: c }))}
                  />
                  {!form.jobLocation.trim() && <p className="mt-1 text-[11px] text-red-500">Required for Office / Hybrid roles.</p>}
                </div>
              )}
            </div>
            <div className={clsx("grid grid-cols-2 gap-4", showJustification ? "md:grid-cols-6" : "md:grid-cols-4")}>
              <div>
                <label className={reqLabel}>Level <span className="text-red-500">*</span></label>
                <Select value={form.jobLevelId} onChange={(v) => setForm({ ...form, jobLevelId: v })} searchable
                  placeholder={jobLevels.length === 0 ? "No levels — create under Settings → Job Levels" : "— Select —"}
                  options={jobLevels.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}`, description: `${l.slaDays} day SLA` }))} />
                <p className="mt-1 text-[11px] text-gray-400">Drives the default hiring SLA for this role.</p>
              </div>
              <div>
                <label className={reqLabel}>Positions</label>
                <NumberInput allowDecimal={false} min={1} max={100} value={form.positions}
                  onChange={(v) => setForm({ ...form, positions: v ?? 1 })}
                  onBlur={() => { if (!form.positions || form.positions < 1) setForm((p) => ({ ...p, positions: 1 })); else if (form.positions > 100) setForm((p) => ({ ...p, positions: 100 })); }}
                  className={clsx(reqInput, form.positions > 100 && "!border-red-400 !ring-red-300")} />
                {form.positions > 100
                  ? <p className="text-[11px] text-red-500 mt-1">Maximum 100 positions.</p>
                  : <p className="text-[11px] text-gray-400 mt-1">Max 100</p>}
              </div>
              <div>
                <label className={reqLabel}>Requisition Type</label>
                <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })}
                  options={[{ value: "NewPosition", label: "New Position" }, { value: "Replacement", label: "Replacement" }, { value: "Expansion", label: "Expansion" }]} />
              </div>
              <div>
                <label className={reqLabel}>Employment</label>
                <Select value={form.employmentType} onChange={(v) => setForm({ ...form, employmentType: v })}
                  options={["FullTime", "PartTime", "Contract", "Intern", "Freelance"].map((t) => ({ value: t, label: t }))} />
              </div>
              {/* Raise mode has no separate Compensation & Planning step (it's
                  removed for being nearly empty there — Salary/Budget/Dates are
                  all hidden), so Experience lives here instead. */}
              {showJustification && (<>
                <div>
                  <label className={reqLabel}>Exp Min (yrs) <span className="text-red-500">*</span></label>
                  <NumberInput min={0} max={50} value={form.experienceMin}
                    onChange={(v) => setForm({ ...form, experienceMin: v })}
                    onBlur={() => { if (form.experienceMin != null && form.experienceMin > 50) setForm((p) => ({ ...p, experienceMin: 50 })); }}
                    className={clsx(reqInput, expRangeError && errRing)} />
                </div>
                <div>
                  <label className={reqLabel}>Exp Max (yrs) <span className="text-red-500">*</span></label>
                  <NumberInput min={0} max={50} value={form.experienceMax}
                    onChange={(v) => setForm({ ...form, experienceMax: v })}
                    onBlur={() => { if (form.experienceMax != null && form.experienceMax > 50) setForm((p) => ({ ...p, experienceMax: 50 })); }}
                    className={clsx(reqInput, expRangeError && errRing)} />
                </div>
              </>)}
            </div>
            {showJustification && expRangeError && (
              <p className={errText}>
                {(form.experienceMin ?? 0) > 50 || (form.experienceMax ?? 0) > 50
                  ? "Experience can’t exceed 50 years." : "Min experience can’t be greater than max."}
              </p>
            )}
            {form.jobLevelId && (
              <div>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                  <input type="checkbox" checked={form.customSlaDays != null}
                    onChange={(e) => setForm({ ...form, customSlaDays: e.target.checked ? (jobLevels.find((l) => l.id === form.jobLevelId)?.slaDays ?? 30) : null, customSlaReason: e.target.checked ? form.customSlaReason : "" })} />
                  Override standard SLA for this requisition
                </label>
                {form.customSlaDays != null && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className={reqLabel}>Approved Custom ETA (days)</label>
                      <NumberInput allowDecimal={false} min={1} max={3650} value={form.customSlaDays}
                        onChange={(v) => setForm({ ...form, customSlaDays: v })} className={reqInput} />
                    </div>
                    <div>
                      <label className={reqLabel}>Reason</label>
                      <input type="text" value={form.customSlaReason} onChange={(e) => setForm({ ...form, customSlaReason: e.target.value })}
                        placeholder="e.g. Specialized technology with limited talent pool" className={reqInput} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={reqLabel}>Priority</label>
                <Select value={form.priority} onChange={(v) => setForm({ ...form, priority: v })}
                  options={["Low", "Medium", "High", "Urgent"].map((p) => ({ value: p, label: p }))} />
              </div>
              <div>
                <label className={reqLabel}>Location</label>
                <Select value={form.workLocation} onChange={(v) => setForm({ ...form, workLocation: v, ...(v === "Remote" ? { jobLocation: "" } : {}) })}
                  options={["Office", "Remote", "Hybrid"].map((t) => ({ value: t, label: t }))} />
              </div>
              {!showJustification && (
                <div>
                  <label className={reqLabel}>Hiring Manager <span className="text-red-500">*</span></label>
                  <Select value={form.hiringManagerId} onChange={(v) => setForm({ ...form, hiringManagerId: v })} searchable
                    placeholder="— Select —" options={empOpts} />
                </div>
              )}
            </div>
            {showJustification && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-medium text-gray-700">Job Description</label>
                  <button type="button" onClick={generate} disabled={generating} title="Also fills Requirements, Nice to have & Skill Weights on the next step"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-[13px] font-semibold shrink-0 disabled:opacity-60">
                    <Sparkles size={13} className={generating ? "animate-pulse" : ""} /> {generating ? "Generating…" : "Generate with AI"}
                  </button>
                </div>
                <textarea rows={4} value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
                  placeholder="Overview of the role, scope and impact." className={clsx(reqInput, "resize-y")} />
              </div>
            )}
            {showJustification && (
              <div>
                <label className={reqLabel}>Business Justification <span className="text-red-500">*</span></label>
                <textarea rows={1} value={form.justification}
                  onChange={(e) => setForm({ ...form, justification: e.target.value })}
                  placeholder={`Why is this hire needed? (min ${JUSTIFICATION_MIN} characters) — reviewed by the approver.`}
                  className={clsx(reqInput, "resize-y", justificationLen > 0 && !justificationOk && errRing)} />
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-gray-400">Shared with the Department Head &amp; HR during approval.</p>
                  <span className={clsx("text-[11px] font-medium tabular-nums shrink-0",
                    justificationOk ? "text-gray-400" : "text-red-500")}>
                    {justificationLen < JUSTIFICATION_MIN
                      ? `${JUSTIFICATION_MIN - justificationLen} more character${JUSTIFICATION_MIN - justificationLen === 1 ? "" : "s"} needed`
                      : `${justificationLen} characters`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2 — Team & Pipeline. Hidden entirely in raise mode; in the main
            flow it renders folded into the "basics" tab (Basics & Team). */}
        {!showJustification && currentStepId === "basics" && (
          <div className="space-y-3 mt-5 pt-4 border-t border-gray-100">
            <p className={clsx(reqSectionAccent, "mb-1")}>Team &amp; Pipeline</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={reqLabel}>Hiring Pipeline <span className="text-red-500">*</span></label>
                <Select value={form.pipelineId} onChange={(v) => setForm({ ...form, pipelineId: v })} searchable
                  placeholder={pipelines.length === 0 ? "No pipelines — create under Settings → Pipelines" : "Select hiring pipeline"}
                  options={pipelines.map((p) => ({ value: p.id, label: p.name + (p.isDefault ? " (default)" : ""),
                    description: p.stages.map((s) => s.name.replace(/([A-Z])/g, " $1").trim()).join(" → ") }))} />
                <p className="mt-1 text-[11px] text-gray-400">Candidates applying to this role flow through the selected pipeline.</p>
              </div>
              <div>
                <label className={reqLabel}>Interview Panel</label>
                <MultiSelect value={form.interviewPanelIds} onChange={(v) => setForm({ ...form, interviewPanelIds: v })}
                  options={empOpts} placeholder="Select panel members..." />
                <p className="mt-1 text-[11px] text-gray-400">Only these employees can be picked as interviewers for this role.</p>
              </div>
              <div>
                <label className={reqLabel}>Reports To</label>
                <Select value={form.reportingToId} onChange={(v) => setForm({ ...form, reportingToId: v })} searchable
                  placeholder="— Select —" options={empOpts} />
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Compensation & Planning */}
        {currentStepId === "comp" && (
          <div className="space-y-3">
            <div>
              <p className={clsx(reqSectionAccent, "mb-2")}>Compensation & Planning</p>
              <div className={clsx("grid grid-cols-2 gap-3", !showJustification && "md:grid-cols-4")}>
                <div>
                  <label className={reqLabel}>Exp Min (yrs) <span className="text-red-500">*</span></label>
                  <NumberInput min={0} max={50} value={form.experienceMin}
                    onChange={(v) => setForm({ ...form, experienceMin: v })}
                    onBlur={() => { if (form.experienceMin != null && form.experienceMin > 50) setForm((p) => ({ ...p, experienceMin: 50 })); }}
                    className={clsx(reqInput, compErrors.exp && errRing)} />
                </div>
                <div>
                  <label className={reqLabel}>Exp Max (yrs) <span className="text-red-500">*</span></label>
                  <NumberInput min={0} max={50} value={form.experienceMax}
                    onChange={(v) => setForm({ ...form, experienceMax: v })}
                    onBlur={() => { if (form.experienceMax != null && form.experienceMax > 50) setForm((p) => ({ ...p, experienceMax: 50 })); }}
                    className={clsx(reqInput, compErrors.exp && errRing)} />
                </div>
                {!showJustification && (<>
                <div>
                  <label className={reqLabel}>Salary Min (LPA) <span className="text-red-500">*</span></label>
                  <NumberInput clamp min={0} max={999} value={form.salaryMin}
                    onChange={(v) => setForm({ ...form, salaryMin: v })}
                    className={clsx(reqInput, compErrors.salary && errRing)} />
                </div>
                <div>
                  <label className={reqLabel}>Salary Max (LPA) <span className="text-red-500">*</span></label>
                  <NumberInput clamp min={0} max={999} value={form.salaryMax}
                    onChange={(v) => setForm({ ...form, salaryMax: v })}
                    className={clsx(reqInput, (compErrors.salary || compErrors.budget) && errRing)} />
                </div>
                </>)}
              </div>
              {(compErrors.exp || compErrors.salary || compErrors.budget) && (
                <ul className="mt-1.5 space-y-0.5">
                  {compErrors.exp && <li className={errText}>{compErrors.exp}</li>}
                  {compErrors.salary && <li className={errText}>{compErrors.salary}</li>}
                  {compErrors.budget && <li className={errText}>{compErrors.budget}</li>}
                </ul>
              )}
              {/* Explain why Next is disabled when the required ranges are blank
                  (only for NEW requisitions — edits are exempt above). */}
              {!compRequiredFilled && (
                <p className={clsx(errText, "mt-1.5")}>
                  {showJustification ? "Experience is required." : "Experience, salary range, Start Date and End Date are required."}
                </p>
              )}
            </div>
            {!showJustification && (
            <div className={reqDivider}>
              <p className={clsx(reqSectionAccent, "mb-2")}>Planning & Timeline</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={reqLabel}>Start Date <span className="text-red-500">*</span></label>
                  <input type="date" min={todayStr} value={form.closedDate}
                    onChange={(e) => {
                      const closedDate = e.target.value;
                      // etaToFillDays still auto-computed and submitted in the
                      // background (the old Recruit Dashboard's aging widget
                      // reads it) — just no longer shown in this form.
                      const eta = closedDate && form.targetJoiningDate ? calcEtaDays(closedDate, form.targetJoiningDate) : null;
                      setForm({ ...form, closedDate, etaToFillDays: eta });
                    }}
                    className={clsx(reqInput, compErrors.closedDate && errRing)} />
                  {compErrors.closedDate && <p className={errText}>{compErrors.closedDate}</p>}
                </div>
                <div>
                  <label className={reqLabel}>End Date <span className="text-red-500">*</span></label>
                  <input type="date" min={todayStr} value={form.targetJoiningDate}
                    onChange={(e) => {
                      const targetJoiningDate = e.target.value;
                      const eta = form.closedDate && targetJoiningDate ? calcEtaDays(form.closedDate, targetJoiningDate) : null;
                      setForm({ ...form, targetJoiningDate, etaToFillDays: eta });
                    }}
                    className={clsx(reqInput, compErrors.targetJoiningDate && errRing)} />
                  {compErrors.targetJoiningDate && <p className={errText}>{compErrors.targetJoiningDate}</p>}
                  {!compErrors.targetJoiningDate && form.jobLevelId && (
                    <p className="mt-1 text-[11px] text-gray-400">Auto-filled from the Level's SLA — edit anytime.</p>
                  )}
                </div>
                <div>
                  <label className={reqLabel}>Budget (LPA)</label>
                  <NumberInput clamp min={0} max={999} value={form.budget} onChange={(v) => setForm({ ...form, budget: v })} className={clsx(reqInput, compErrors.budget && errRing)} />
                </div>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Step 4 — Role Details */}
        {currentStepId === "role" && (
          <div className="space-y-3">
            {/* Raise mode shows this in Basics instead (see above). */}
            {!showJustification && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className={reqSectionAccent}>Role Details &amp; Information</p>
                  <button type="button" onClick={generate} disabled={generating} title="Also fills Requirements, Nice to have & Skill Weights below"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-[13px] font-semibold shrink-0 disabled:opacity-60">
                    <Sparkles size={13} className={generating ? "animate-pulse" : ""} /> {generating ? "Generating…" : "Generate with AI"}
                  </button>
                </div>
                <label className={reqLabel}>Job Description</label>
                <textarea rows={4} value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
                  placeholder="Overview of the role, scope and impact." className={clsx(reqInput, "resize-y")} />
              </div>
            )}
            <div className={reqDivider}>
              <p className={clsx(reqSectionAccent, "mb-2")}>Requirements &amp; Posting</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <BulletListField label="Requirements (must-have)" accent="violet" placeholder="e.g. 5+ yrs building distributed systems"
                  items={form.requirements} onChange={(v) => setForm({ ...form, requirements: v })} />
                <BulletListField label="Nice to have" accent="green" placeholder="e.g. Open-source contributions"
                  items={form.niceToHave} onChange={(v) => setForm({ ...form, niceToHave: v })} />
                {!showJustification && (
                  <BulletListField label="Benefits &amp; Perks" accent="sky" placeholder="e.g. Health insurance, ESOPs, flexible hours"
                    items={form.benefits} onChange={(v) => setForm({ ...form, benefits: v })} />
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Drag to reorder · Click × to remove.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <BulletListField label="Responsibilities" accent="amber" placeholder="e.g. Run discovery workshops and consulting discussions"
                  items={form.responsibilities} onChange={(v) => setForm({ ...form, responsibilities: v })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={reqLabel}>Education qualification required</label>
                    <Select
                      value={form.education}
                      onChange={(v) => setForm({ ...form, education: v })}
                      placeholder="Select minimum qualification"
                      options={[
                        "Class 10 (Secondary)",
                        "Class 12 (Intermediate)",
                        "Diploma",
                        "Graduation/Diploma",
                        "Post Graduation",
                        "Doctorate/PhD",
                      ].map((q) => ({ value: q, label: q }))}
                    />
                  </div>
                  <div>
                    <label className={reqLabel}>Year of passing <span className="text-gray-400 font-normal">(optional)</span></label>
                    <NumberInput allowDecimal={false} min={1950} max={2100} maxLength={4} value={form.passingYear}
                      onChange={(v) => setForm({ ...form, passingYear: v })}
                      onBlur={() => {
                        if (form.passingYear == null) return;
                        if (form.passingYear < 1950) setForm((p) => ({ ...p, passingYear: 1950 }));
                        else if (form.passingYear > 2100) setForm((p) => ({ ...p, passingYear: 2100 }));
                      }}
                      placeholder="e.g. 2020" className={reqInput} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5 — Scorecard & Skills. Has no tab of its own in either mode —
            it renders stacked right under Role Details on that same step
            (see the "role" folded into visibleSteps' label above). */}
        {currentStepId === "role" && (
          <div className="space-y-3 mt-5 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="rounded-lg border border-green-200 bg-gradient-to-br from-green-50/60 to-white p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-green-800"><Sparkles size={14} /> Scorecard &amp; Skills</div>
                  <p className="text-[11px] text-gray-600 mt-0.5">Weight = importance (1 low, 10 critical). Used to score candidate resumes. Example: React → 9, AWS → 5</p>
                </div>
                <span className="text-[11px] text-gray-500 whitespace-nowrap">{form.skillWeights.length} skill{form.skillWeights.length === 1 ? "" : "s"}</span>
              </div>

              {form.skillWeights.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {form.skillWeights.map((sw, idx) => (
                    <div key={`${sw.skill}-${idx}`} className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2 py-1.5">
                      <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{sw.skill}</span>
                      <div className="flex items-center gap-1 w-48">
                        <input type="range" min={1} max={10} value={sw.weight}
                          onChange={(e) => { const w = Number(e.target.value); setForm((p) => ({ ...p, skillWeights: p.skillWeights.map((x, i) => i === idx ? { ...x, weight: w } : x) })); }}
                          className="flex-1 accent-green-600" />
                        <span className="text-xs font-bold text-green-700 w-6 text-right">{sw.weight}</span>
                      </div>
                      <button type="button" onClick={() => setForm((p) => ({ ...p, skillWeights: p.skillWeights.filter((_, i) => i !== idx) }))}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Remove"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input type="text" value={skillDraft} onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const s = skillDraft.trim();
                      if (!s) return;
                      if (form.skillWeights.some((x) => x.skill.toLowerCase() === s.toLowerCase())) {
                        toast.error(`"${s}" is already added`);
                        return;
                      }
                      setForm((p) => ({ ...p, skillWeights: [...p.skillWeights, { skill: s, weight: weightDraft }] }));
                      setSkillDraft("");
                    }
                  }}
                  // Only commit on Enter or the "+ Add" button — no onBlur add, so
                  // clicking Next/Save doesn't silently push a half-typed skill.
                  placeholder="e.g., React, AWS, System Design"
                  className="flex-1 border border-gray-300 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500" />
                <div className="flex items-center gap-1">
                  <label className="text-[10px] font-semibold text-gray-500">W</label>
                  <Select value={String(weightDraft)} onChange={(v) => setWeightDraft(Number(v))} size="sm" className="w-20"
                    options={[1,2,3,4,5,6,7,8,9,10].map((nn) => ({ value: String(nn), label: String(nn) }))} />
                </div>
                <button type="button"
                  onClick={() => {
                    const s = skillDraft.trim();
                    if (!s) return;
                    if (form.skillWeights.some((x) => x.skill.toLowerCase() === s.toLowerCase())) {
                      toast.error(`"${s}" is already added`);
                      return;
                    }
                    setForm((p) => ({ ...p, skillWeights: [...p.skillWeights, { skill: s, weight: weightDraft }] }));
                    setSkillDraft("");
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium"><Plus size={13} /> Add</button>
              </div>
            </div>

            {/* Technical Questions — merged into Scorecard & Skills */}
            <div className="rounded-lg border border-rose-200 bg-gradient-to-br from-rose-50/60 to-white p-3">
              <div className="mb-2">
                <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose-800">
                  <HelpCircle size={14} /> Screening Technical Questions <span className="text-red-500">*</span>
                </div>
              </div>
              <BulletListField
                label="Questions"
                accent="rose"
                placeholder="e.g. Explain the difference between useMemo and useCallback"
                items={form.technicalQuestions}
                onChange={(v) => setForm({ ...form, technicalQuestions: v })}
              />
              {!questionsOk && <p className={errText}>Add at least one technical question.</p>}
            </div>
          </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-gray-100">
        <button type="button" onClick={onCancel}
          className="inline-flex items-center px-3 py-1.5 rounded-full border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button type="button" onClick={back}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <ArrowLeft size={13} /> Back
            </button>
          )}
          {step < visibleSteps.length - 1 ? (
            <button type="button" onClick={next} disabled={!canAdvance}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50">
              Next <ArrowRight size={13} />
            </button>
          ) : (
            <button type="button" onClick={onSubmit} disabled={submitting || !canCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50">
              {submitting ? "Saving…" : (submitLabel ?? (isEdit ? "Save Changes" : "Create"))}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


const BULLET_ACCENTS = {
  violet: { text: "text-violet-700", badge: "bg-violet-50 text-violet-700 ring-violet-200", ghost: "text-violet-600 hover:bg-violet-50" },
  green: { text: "text-green-700", badge: "bg-green-50 text-green-700 ring-green-200", ghost: "text-green-600 hover:bg-green-50" },
  sky: { text: "text-sky-700", badge: "bg-sky-50 text-sky-700 ring-sky-200", ghost: "text-sky-600 hover:bg-sky-50" },
  amber: { text: "text-amber-700", badge: "bg-amber-50 text-amber-700 ring-amber-200", ghost: "text-amber-600 hover:bg-amber-50" },
  rose: { text: "text-rose-700", badge: "bg-rose-50 text-rose-700 ring-rose-200", ghost: "text-rose-600 hover:bg-rose-50" },
} as const;

function BulletListField({
  label, placeholder, items, onChange, accent = "violet", max,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (next: string[]) => void;
  accent?: keyof typeof BULLET_ACCENTS;
  // No cap by default — add as many as needed. Pass a number to keep a hard limit.
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dragFrom = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const colors = BULLET_ACCENTS[accent];
  const atMax = max != null && items.length >= max;
  const toast = useToast();

  const add = () => {
    const v = draft.trim();
    if (!v || atMax) return;
    onChange([...items, v]);
    setDraft("");
  };

  // Pasting a multi-line block (one requirement per line/paragraph) splits it
  // into individual bullets instead of dumping it all into one entry.
  const addPastedLines = (raw: string) => {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    if (max == null) { onChange([...items, ...lines]); return; }
    const room = Math.max(0, max - items.length);
    const toAdd = lines.slice(0, room);
    if (toAdd.length === 0) { toast.error(`${label} is already at the ${max} limit.`); return; }
    onChange([...items, ...toAdd]);
    if (lines.length > toAdd.length) {
      toast.error(`Added ${toAdd.length} of ${lines.length} — ${label} is capped at ${max}.`);
    }
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className={clsx("text-[11px] font-bold uppercase tracking-wide", colors.text)}>{label}</span>
          <span className={clsx("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ring-1 tabular-nums", colors.badge)}>
            {max != null ? `${items.length}/${max}` : items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { if (draft.trim()) add(); else inputRef.current?.focus(); }}
          disabled={atMax}
          className={clsx("inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed", colors.ghost)}
        >
          <Plus size={11} /> Add
        </button>
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5 mb-2 max-h-[168px] overflow-y-auto pr-0.5">
          {items.map((it, i) => (
            <li
              key={i}
              draggable
              onDragStart={() => { dragFrom.current = i; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
              onDragLeave={() => setDragOverIdx((cur) => (cur === i ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom.current != null) reorder(dragFrom.current, i);
                dragFrom.current = null;
                setDragOverIdx(null);
              }}
              onDragEnd={() => { dragFrom.current = null; setDragOverIdx(null); }}
              className={clsx(
                "flex items-center gap-2 bg-gray-50/70 ring-1 rounded-lg px-2 py-1.5 text-xs text-gray-800",
                dragOverIdx === i ? "ring-2 ring-offset-1 ring-gray-300" : "ring-gray-100",
              )}
            >
              <span className="text-gray-300 cursor-grab active:cursor-grabbing shrink-0" title="Drag to reorder">
                <GripVertical size={13} />
              </span>
              <span className="flex-1 min-w-0 break-words">{it}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-red-600 shrink-0"
                aria-label="Remove"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {atMax ? (
        <p className="text-[11px] text-gray-400 text-center py-1.5">Maximum {max} reached</p>
      ) : (
        <div className="flex items-center gap-1.5 border border-dashed border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50/40 focus-within:border-solid focus-within:border-green-400 focus-within:bg-white transition-colors">
          <Plus size={12} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (/\r?\n/.test(text.trim())) {
                e.preventDefault();
                addPastedLines(text);
                setDraft("");
              }
            }}
            // Commit only on Enter or the "+" button — no onBlur add, so clicking
            // Next doesn't silently push a half-typed entry.
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none placeholder:text-gray-400"
          />
          {draft.trim() && (
            <button type="button" onClick={add} className="shrink-0 text-green-600 hover:text-green-700" aria-label="Add">
              <Check size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Requisition form ↔ payload helpers ─────────────────
