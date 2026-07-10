"use client";

import { useEffect, useRef, useState } from "react";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { Plus, X, Check, ChevronDown, Sparkles, Trash2, Target, ArrowLeft, ArrowRight, Search as SearchIcon } from "lucide-react";

export interface DeptOption { id: string; name: string; code?: string | null; }
export interface PipelineOption { id: string; name: string; isDefault: boolean; stages: { name: string }[]; }
export interface SkillWeightItem { skill: string; weight: number }

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
  jobDescription: string;
  requirements: string[];
  niceToHave: string[];
  benefits: string[];
  education: string;
  referralBonusAmount: number | null;
  careerPageVisible: boolean;
  internalPostingOnly: boolean;
  postToJobPortal: boolean;
  rolePurpose: string;
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
  experienceMin: null, experienceMax: null, salaryMin: null, salaryMax: null, budget: null,
  targetJoiningDate: "", closedDate: "", etaToFillDays: null, jobGrade: "", costCenter: "",
  jobDescription: "", requirements: [], niceToHave: [], benefits: [],
  education: "", referralBonusAmount: null, careerPageVisible: true, internalPostingOnly: false, postToJobPortal: false,
  rolePurpose: "", responsibilities: [], skillWeights: [], justification: "",
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
    jobDescription: s(f.jobDescription),
    requirements: arr(f.requirements),
    niceToHave: arr(f.niceToHave),
    benefits: arr(f.benefits),
    education: s(f.education),
    referralBonusAmount: n(f.referralBonusAmount),
    careerPageVisible: f.careerPageVisible,
    internalPostingOnly: f.internalPostingOnly,
    postToJobPortal: f.postToJobPortal,
    rolePurpose: s(f.rolePurpose),
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

  useEffect(() => {
    if (!open) { setQ(""); return; }
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
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

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 bg-gray-50">
            <div className="relative">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..."
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500" />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
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
        </div>
      )}
    </div>
  );
}

// ─── Requisition Wizard ─────────────────────────────────

const REQ_STEPS = [
  { id: "basics", label: "Basics" },
  { id: "team", label: "Team & Pipeline" },
  { id: "comp", label: "Compensation & Planning" },
  { id: "role", label: "Role Details" },
  { id: "scorecard", label: "Scorecard & Skills" },
] as const;

const reqInput = "w-full border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500";
const reqLabel = "block text-xs font-medium text-gray-700 mb-1.5";
const reqSection = "text-[11px] font-bold uppercase tracking-wide text-gray-400";

/** Minimum characters required in the Business Justification field. */
const JUSTIFICATION_MIN = 10;
const errRing = "border-red-400 focus:border-red-500 focus:ring-red-500/20";
const errText = "text-[11px] text-red-600 mt-1";

interface ReqWizardProps {
  form: ReqFormShape;
  setForm: React.Dispatch<React.SetStateAction<ReqFormShape>>;
  isEdit: boolean;
  departments: DeptOption[];
  pipelines: PipelineOption[];
  employees: EmpOption[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  /** Raise mode — shows a required Business Justification field + relabels the submit button. */
  showJustification?: boolean;
  submitLabel?: string;
}

export function RequisitionWizard({ form, setForm, isEdit, departments, pipelines, employees, submitting, onCancel, onSubmit, showJustification, submitLabel }: ReqWizardProps) {
  const api = useApiClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [skillDraft, setSkillDraft] = useState("");
  const [weightDraft, setWeightDraft] = useState(7);
  const [generating, setGenerating] = useState(false);

  const empOpts: MSOption[] = employees.map((e) => ({
    value: e.id,
    label: (e.displayName?.trim() || `${e.firstName} ${e.lastName}`).trim(),
    description: [e.employeeCode, e.designation?.title || e.jobTitle].filter(Boolean).join(" · ") || undefined,
  }));

  const justificationLen = form.justification.trim().length;
  const justificationOk = !showJustification || justificationLen >= JUSTIFICATION_MIN;
  const canStep1 = form.title.trim().length > 0 && !!form.departmentId && justificationOk;
  const canStep2 = !!form.pipelineId;

  // Step 3 (Compensation & Planning) cross-field logic checks.
  const todayStr = new Date().toISOString().slice(0, 10);
  const compErrors = {
    exp: form.experienceMin != null && form.experienceMax != null && form.experienceMin > form.experienceMax
      ? "Min experience can’t be greater than max." : "",
    salary: form.salaryMin != null && form.salaryMax != null && form.salaryMin > form.salaryMax
      ? "Min salary can’t be greater than max." : "",
    budget: form.budget != null && form.salaryMax != null && form.budget < form.salaryMax
      ? "Budget should be at least the max salary." : "",
    targetJoiningDate: form.targetJoiningDate && form.targetJoiningDate < todayStr
      ? "Target joining date can’t be in the past."
      : form.targetJoiningDate && form.closedDate && form.targetJoiningDate < form.closedDate
        ? "Should be on or after the close timeline." : "",
    closedDate: form.closedDate && form.closedDate < todayStr
      ? "Timeline to close can’t be in the past." : "",
  };
  const step3Valid = !compErrors.exp && !compErrors.salary && !compErrors.budget && !compErrors.targetJoiningDate && !compErrors.closedDate;
  const canCreate = canStep1 && canStep2 && step3Valid;

  const next = () => setStep((s) => Math.min(s + 1, REQ_STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const canAdvance = step === 0 ? canStep1 : step === 1 ? canStep2 : step === 2 ? step3Valid : true;

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
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {REQ_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => (i < step || canAdvance || i === step) && setStep(i)}
                className="flex items-center gap-2 group">
                <span className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition shrink-0",
                  done ? "bg-green-600 text-white" : active ? "bg-green-600 text-white ring-4 ring-green-100" : "bg-gray-200 text-gray-500")}>
                  {done ? <Check size={13} /> : i + 1}
                </span>
                <span className={clsx("text-xs font-medium whitespace-nowrap", active ? "text-gray-900" : done ? "text-gray-600" : "text-gray-400")}>
                  {s.label}
                </span>
              </button>
              {i < REQ_STEPS.length - 1 && <span className={clsx("w-8 h-px mx-1", done ? "bg-green-500" : "bg-gray-200")} />}
            </div>
          );
        })}
      </div>

      <div className="min-h-[300px]">
        {/* Step 1 — Basics */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
            <div>
              <label className={reqLabel}>Job Opening Name <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" value={form.jobOpeningName} onChange={(e) => setForm({ ...form, jobOpeningName: e.target.value })}
                placeholder="A friendly name for this opening" className={reqInput} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={reqLabel}>Positions</label>
                <NumberInput allowDecimal={false} min={1} value={form.positions} onChange={(v) => setForm({ ...form, positions: v ?? 1 })} className={reqInput} />
              </div>
              <div>
                <label className={reqLabel}>Requisition Type</label>
                <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })}
                  options={[{ value: "NewPosition", label: "New Position" }, { value: "Replacement", label: "Replacement" }, { value: "Expansion", label: "Expansion" }]} />
              </div>
              <div>
                <label className={reqLabel}>Employment</label>
                <Select value={form.employmentType} onChange={(v) => setForm({ ...form, employmentType: v })}
                  options={["FullTime", "PartTime", "Contract", "Intern", "Freelancer", "Consultant"].map((t) => ({ value: t, label: t }))} />
              </div>
              <div>
                <label className={reqLabel}>Location</label>
                <Select value={form.workLocation} onChange={(v) => setForm({ ...form, workLocation: v })}
                  options={["Office", "Remote", "Hybrid"].map((t) => ({ value: t, label: t }))} />
              </div>
            </div>
            <div>
              <label className={reqLabel}>Priority</label>
              <div className="inline-flex items-center gap-2 flex-wrap">
                {["Low", "Medium", "High", "Urgent"].map((p) => (
                  <button key={p} type="button" onClick={() => setForm({ ...form, priority: p })}
                    className={clsx("px-4 py-1.5 rounded-full text-[13px] font-semibold border transition",
                      form.priority === p ? "bg-green-600 border-green-600 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-green-400")}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {showJustification && (
              <div>
                <label className={reqLabel}>Business Justification <span className="text-red-500">*</span></label>
                <textarea rows={3} value={form.justification}
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

        {/* Step 2 — Team & Pipeline */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={reqLabel}>Reports To</label>
                <Select value={form.reportingToId} onChange={(v) => setForm({ ...form, reportingToId: v })} searchable
                  placeholder="— Select —" options={empOpts} />
              </div>
              <div>
                <label className={reqLabel}>Hiring Manager</label>
                <Select value={form.hiringManagerId} onChange={(v) => setForm({ ...form, hiringManagerId: v })} searchable
                  placeholder="— Select —" options={empOpts} />
              </div>
              <div>
                <label className={reqLabel}>Recruiter</label>
                <Select value={form.recruiterId} onChange={(v) => setForm({ ...form, recruiterId: v })} searchable
                  placeholder="— Select —" options={empOpts} />
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Compensation & Planning */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <p className={clsx(reqSection, "mb-2")}>Experience & Compensation</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className={reqLabel}>Exp Min (yrs)</label>
                  <NumberInput allowDecimal={false} min={0} value={form.experienceMin} onChange={(v) => setForm({ ...form, experienceMin: v })} className={clsx(reqInput, compErrors.exp && errRing)} />
                </div>
                <div>
                  <label className={reqLabel}>Exp Max (yrs)</label>
                  <NumberInput allowDecimal={false} min={0} value={form.experienceMax} onChange={(v) => setForm({ ...form, experienceMax: v })} className={clsx(reqInput, compErrors.exp && errRing)} />
                </div>
                <div>
                  <label className={reqLabel}>Salary Min (LPA)</label>
                  <NumberInput min={0} value={form.salaryMin} onChange={(v) => setForm({ ...form, salaryMin: v })} className={clsx(reqInput, compErrors.salary && errRing)} />
                </div>
                <div>
                  <label className={reqLabel}>Salary Max (LPA)</label>
                  <NumberInput min={0} value={form.salaryMax} onChange={(v) => setForm({ ...form, salaryMax: v })} className={clsx(reqInput, (compErrors.salary || compErrors.budget) && errRing)} />
                </div>
                <div>
                  <label className={reqLabel}>Budget (₹)</label>
                  <NumberInput min={0} value={form.budget} onChange={(v) => setForm({ ...form, budget: v })} className={clsx(reqInput, compErrors.budget && errRing)} />
                </div>
              </div>
              {(compErrors.exp || compErrors.salary || compErrors.budget) && (
                <ul className="mt-1.5 space-y-0.5">
                  {compErrors.exp && <li className={errText}>{compErrors.exp}</li>}
                  {compErrors.salary && <li className={errText}>{compErrors.salary}</li>}
                  {compErrors.budget && <li className={errText}>{compErrors.budget}</li>}
                </ul>
              )}
            </div>
            <div>
              <p className={clsx(reqSection, "mb-2")}>Planning & Budget</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={reqLabel}>Target Joining Date</label>
                  <input type="date" min={todayStr} value={form.targetJoiningDate} onChange={(e) => setForm({ ...form, targetJoiningDate: e.target.value })} className={clsx(reqInput, compErrors.targetJoiningDate && errRing)} />
                  {compErrors.targetJoiningDate && <p className={errText}>{compErrors.targetJoiningDate}</p>}
                </div>
                <div>
                  <label className={reqLabel}>Timeline to Close</label>
                  <input type="date" min={todayStr} value={form.closedDate}
                    onChange={(e) => {
                      const closedDate = e.target.value;
                      const eta = closedDate
                        ? Math.max(0, Math.ceil((new Date(closedDate + "T00:00:00").getTime() - Date.now()) / 86400000))
                        : null;
                      setForm({ ...form, closedDate, etaToFillDays: eta });
                    }}
                    className={clsx(reqInput, compErrors.closedDate && errRing)} />
                  {compErrors.closedDate && <p className={errText}>{compErrors.closedDate}</p>}
                </div>
                <div>
                  <label className={reqLabel}>ETA to Fill (days)</label>
                  <NumberInput allowDecimal={false} min={0} value={form.etaToFillDays} onChange={() => {}}
                    readOnly tabIndex={-1} className={clsx(reqInput, "bg-gray-50 text-gray-600 cursor-not-allowed")} />
                  <p className="mt-1 text-[11px] text-gray-400">Auto-calculated from today to Timeline to Close.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4 — Role Details */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#bbf7d0] bg-gradient-to-r from-[#f0fdf4] to-white px-3 py-2.5">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#15803d]"><Sparkles size={14} /> Auto-write with AI</div>
                <p className="text-[11px] text-gray-600 mt-0.5">Generates the description, responsibilities &amp; skill weights from the role title and experience. Fully editable after.</p>
              </div>
              <button type="button" onClick={generate} disabled={generating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium shrink-0 disabled:opacity-60">
                <Sparkles size={13} className={generating ? "animate-pulse" : ""} /> {generating ? "Generating…" : "Generate with AI"}
              </button>
            </div>
            <div>
              <label className={reqLabel}>Job Description</label>
              <textarea rows={4} value={form.jobDescription} onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
                placeholder="Overview of the role, scope and impact." className={clsx(reqInput, "resize-y")} />
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className={clsx(reqSection, "mb-2")}>Requirements &amp; Posting</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BulletListField label="Requirements (must-have)" placeholder="e.g. 5+ yrs building distributed systems"
                  items={form.requirements} onChange={(v) => setForm({ ...form, requirements: v })} />
                <BulletListField label="Nice to have" placeholder="e.g. Open-source contributions"
                  items={form.niceToHave} onChange={(v) => setForm({ ...form, niceToHave: v })} />
              </div>
              <div className="mt-3">
                <BulletListField label="Benefits &amp; Perks" placeholder="e.g. Health insurance, ESOPs, flexible hours"
                  items={form.benefits} onChange={(v) => setForm({ ...form, benefits: v })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <div>
                  <label className={reqLabel}>Education</label>
                  <input type="text" value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} placeholder="e.g. B.Tech / B.E. in CS or equivalent" className={reqInput} />
                </div>
                <div>
                  <label className={reqLabel}>Referral Bonus (₹)</label>
                  <NumberInput min={0} value={form.referralBonusAmount} onChange={(v) => setForm({ ...form, referralBonusAmount: v })} className={reqInput} />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.careerPageVisible} onChange={(e) => setForm({ ...form, careerPageVisible: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                  Show on careers page
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.internalPostingOnly} onChange={(e) => setForm({ ...form, internalPostingOnly: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                  Internal posting only
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 5 — Scorecard & Skills */}
        {step === 4 && (
          <div className="space-y-4">
            <RoleScorecardSection form={form} setForm={setForm} />

            <div className="rounded-lg border border-green-200 bg-gradient-to-br from-green-50/60 to-white p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-green-800"><Sparkles size={14} /> ATS Skill Weights</div>
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
                      if (s && !form.skillWeights.some((x) => x.skill.toLowerCase() === s.toLowerCase())) {
                        setForm((p) => ({ ...p, skillWeights: [...p.skillWeights, { skill: s, weight: weightDraft }] }));
                        setSkillDraft("");
                      }
                    }
                  }}
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
                    if (form.skillWeights.some((x) => x.skill.toLowerCase() === s.toLowerCase())) return;
                    setForm((p) => ({ ...p, skillWeights: [...p.skillWeights, { skill: s, weight: weightDraft }] }));
                    setSkillDraft("");
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-medium"><Plus size={13} /> Add</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-gray-100">
        <button type="button" onClick={onCancel}
          className="inline-flex items-center px-3 py-1.5 rounded-full border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button type="button" onClick={back}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <ArrowLeft size={13} /> Back
            </button>
          )}
          {step < REQ_STEPS.length - 1 ? (
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

interface ScorecardForm {
  rolePurpose: string;
  responsibilities: string[];
}

function RoleScorecardSection<T extends ScorecardForm>({
  form, setForm,
}: {
  form: T;
  setForm: React.Dispatch<React.SetStateAction<T>>;
}) {
  const [open, setOpen] = useState(false);

  const filled =
    (form.rolePurpose.trim() ? 1 : 0)
    + form.responsibilities.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Target size={14} className="text-green-700" />
          <span className="text-[13px] font-semibold text-gray-800">Role Scorecard</span>
          <span className="text-[11px] text-gray-500 font-normal">(optional)</span>
          {filled > 0 && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 text-[10px] font-bold tabular-nums">
              {filled} field{filled === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
          <p className="text-[11px] text-gray-500">
            Captures the success criteria of the role — shared with candidates and used during onboarding & reviews.
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
              Role purpose
            </label>
            <textarea
              rows={2}
              value={form.rolePurpose}
              onChange={(e) => setForm((p) => ({ ...p, rolePurpose: e.target.value }))}
              placeholder="e.g. Own enterprise growth by building a predictable sales pipeline and driving strategic account expansion."
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 resize-none"
            />
            <p className="mt-1 text-[10px] text-gray-400">{form.rolePurpose.length} / 500 characters · 1–2 sentences</p>
          </div>

          <BulletListField
            label="Key responsibilities"
            placeholder="e.g. Run discovery workshops and consulting discussions"
            items={form.responsibilities}
            onChange={(next) => setForm((p) => ({ ...p, responsibilities: next }))}
          />
        </div>
      )}
    </div>
  );
}

function BulletListField({
  label, placeholder, items, onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <label className="block text-gray-700 mb-1 text-xs font-bold uppercase tracking-wide">{label}</label>
      {items.length > 0 && (
        <ul className="space-y-1 mb-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 bg-gray-50 ring-1 ring-gray-100 rounded px-2 py-1 text-xs text-gray-800">
              <span className="text-gray-300">•</span>
              <span className="flex-1">{it}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-red-600"
                aria-label="Remove"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}


// ─── Requisition form ↔ payload helpers ─────────────────
