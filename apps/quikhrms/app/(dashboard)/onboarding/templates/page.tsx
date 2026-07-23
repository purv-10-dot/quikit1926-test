"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { useDepartments, useDesignations } from "@/lib/hooks/use-ref-data";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { clsx } from "clsx";
import {
  Plus, ListChecks, Pencil, Trash2, FileText, GripVertical,
  Check, ChevronDown, Copy, Search,
} from "lucide-react";

type Category = "Documentation" | "ItSetup" | "Training" | "Compliance" | "Introduction" | "TaskOther";
type AssigneeRole = "ReportingManagerRole" | "HRRole" | "ITRole" | "FinanceRole" | "AdminRole" | "EmployeeRole" | "CustomRole";
type StepType =
  | "CustomTask" | "CompleteProfile" | "DocumentUpload" | "SendEmail" | "Approval" | "FillForm"
  | "ReadPolicy" | "Training" | "ITProvisioning" | "AssetAssignment";

type FieldKind = "text" | "select" | "search" | "toggle";
interface FieldSpec { key: string; label: string; kind: FieldKind; options?: string[]; placeholder?: string; }
interface TypeDef { label: string; color: "gray" | "blue" | "amber" | "violet" | "green"; category: Category; fields: FieldSpec[]; }

const TYPES: Record<StepType, TypeDef> = {
  CustomTask:      { label: "Custom Task",      color: "gray",   category: "TaskOther",     fields: [] },
  // The new hire (or HR) fills the missing mandatory profile fields — DOB,
  // gender, address, emergency contact, PAN/Aadhaar, reporting manager — from a
  // form on the onboarding page. Saved straight to the employee record.
  CompleteProfile: { label: "Complete Profile", color: "violet", category: "TaskOther", fields: [] },
  // Document Upload uses a custom "list of documents" editor (see StepCard),
  // not the generic settings fields.
  DocumentUpload:  { label: "Document Upload",  color: "blue",   category: "Documentation", fields: [] },
  SendEmail:       { label: "Send Email",       color: "amber",  category: "Introduction",  fields: [
    { key: "template", label: "Email Template", kind: "search", placeholder: "Search email templates…" },
    { key: "recipient", label: "Recipient", kind: "select", options: ["New Hire", "Reporting Manager", "HR Team", "Custom"] },
    { key: "trigger", label: "Trigger", kind: "select", options: ["On step start", "On previous step complete", "On joining date"] },
    { key: "cc", label: "CC", kind: "text", placeholder: "comma-separated" },
    { key: "bcc", label: "BCC", kind: "text", placeholder: "comma-separated" },
  ] },
  Approval:        { label: "Approval",         color: "violet", category: "Compliance",    fields: [
    { key: "approver", label: "Approver", kind: "search", placeholder: "Search users / roles…" },
    { key: "escalation", label: "Escalation", kind: "select", options: ["None", "After 2 days → HR Head", "After 1 day → Manager"] },
    { key: "autoApprove", label: "Auto approve after", kind: "text", placeholder: "e.g. 5 days" },
  ] },
  FillForm:        { label: "Fill Form",        color: "blue",   category: "Documentation", fields: [
    { key: "form", label: "Form Template", kind: "search", placeholder: "Search forms…" },
    { key: "required", label: "Required", kind: "toggle" },
  ] },
  ReadPolicy:      { label: "Read Policy",      color: "blue",   category: "Compliance",    fields: [
    { key: "policy", label: "Policy Document", kind: "search", placeholder: "Search policies…" },
    { key: "ack", label: "Require acknowledgement", kind: "toggle" },
  ] },
  Training:        { label: "Training",         color: "green",  category: "Training",      fields: [
    { key: "course", label: "Course / Module", kind: "search", placeholder: "Search courses…" },
    { key: "duration", label: "Duration", kind: "text", placeholder: "e.g. 2 hours" },
    { key: "passing", label: "Passing score", kind: "text", placeholder: "e.g. 70%" },
  ] },
  ITProvisioning:  { label: "IT Provisioning",  color: "gray",   category: "ItSetup",       fields: [
    { key: "system", label: "System / Access", kind: "select", options: ["Email + SSO", "VPN", "Repository access", "Custom"] },
    { key: "owner", label: "Owner team", kind: "select", options: ["IT Team", "Security", "DevOps"] },
  ] },
  AssetAssignment: { label: "Asset Assignment", color: "gray",   category: "ItSetup",       fields: [
    { key: "asset", label: "Asset Type", kind: "select", options: ["Laptop", "Monitor", "Phone", "Access Card", "Custom"] },
    { key: "quantity", label: "Quantity", kind: "text", placeholder: "1" },
  ] },
};
const STEP_TYPE_KEYS = Object.keys(TYPES) as StepType[];

// Sentinel value in the "Assign To" dropdown meaning "the new hire being
// onboarded" (rather than an org department). Stored in config.assignDepartmentId.
const CANDIDATE = "__candidate__";

const ASSIGN: { role: AssigneeRole; label: string }[] = [
  { role: "EmployeeRole", label: "Employee" },
  { role: "HRRole", label: "HR Team" },
  { role: "ITRole", label: "IT Team" },
  { role: "ReportingManagerRole", label: "Reporting Manager" },
  { role: "FinanceRole", label: "Finance" },
  { role: "AdminRole", label: "Admin" },
];
const assignLabel = (r: AssigneeRole) => ASSIGN.find((a) => a.role === r)?.label ?? r;

const TAG: Record<TypeDef["color"], string> = {
  gray: "bg-slate-100 text-slate-600", blue: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700", green: "bg-green-50 text-green-700",
};
const INPUT = "w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-green-500/25 focus:border-green-500";

interface Step {
  title: string; stepType: StepType; assigneeRole: AssigneeRole; dueInDays: number; isMandatory: boolean;
  description?: string; dependencies?: string; reminder?: string; visibility?: string; notes?: string;
  config: Record<string, unknown>;
}
interface TaskTpl extends Partial<Step> { title: string; assigneeRole: AssigneeRole; dueInDays: number; category: Category; isMandatory: boolean; sortOrder: number; }
interface Template { id: string; name: string; description: string | null; departmentId: string | null; designationId: string | null; tasks: TaskTpl[]; isActive: boolean; createdAt: string; }

const newStep = (): Step => ({ title: "", stepType: "CustomTask", assigneeRole: "HRRole", dueInDays: 3, isMandatory: true, config: {} });
const toStep = (t: TaskTpl): Step => ({
  title: t.title, stepType: (t.stepType as StepType) ?? "CustomTask", assigneeRole: t.assigneeRole,
  dueInDays: t.dueInDays, isMandatory: t.isMandatory, description: t.description ?? undefined,
  dependencies: t.dependencies, reminder: t.reminder, visibility: t.visibility, notes: t.notes,
  config: (t.config as Record<string, unknown>) ?? {},
});

export default function OnboardingTemplatesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Step[]>([newStep()]);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const reset = () => { setName(""); setDescription(""); setSteps([newStep()]); setOpen({ 0: true }); };
  const openCreate = () => { setEditingId(null); reset(); setShowCreate(true); };
  const openEdit = (t: Template) => {
    setEditingId(t.id); setName(t.name); setDescription(t.description ?? "");
    setSteps((t.tasks ?? []).length ? (t.tasks ?? []).map(toStep) : [newStep()]);
    setOpen({ 0: true }); setShowCreate(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", "templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/onboarding/templates?limit=100"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["onboarding", "templates"] });
  const createMut = useMutation({ mutationFn: (b: Record<string, unknown>) => api.post("/api/v1/hrms/onboarding/templates", b), onSuccess: () => { invalidate(); setShowCreate(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, b }: { id: string; b: Record<string, unknown> }) => api.put(`/api/v1/hrms/onboarding/templates/${id}`, b), onSuccess: () => { invalidate(); setShowCreate(false); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => api.delete(`/api/v1/hrms/onboarding/templates/${id}`), onSuccess: () => invalidate() });
  const saving = createMut.isPending || updateMut.isPending;

  const patch = (i: number, p: Partial<Step>) => setSteps((s) => s.map((st, idx) => idx === i ? { ...st, ...p } : st));
  const patchConfig = (i: number, key: string, v: unknown) => setSteps((s) => s.map((st, idx) => idx === i ? { ...st, config: { ...st.config, [key]: v } } : st));
  const addStep = () => setSteps((s) => { setOpen((o) => ({ ...o, [s.length]: true })); return [...s, newStep()]; });
  const dupStep = (i: number) => setSteps((s) => [...s.slice(0, i + 1), { ...s[i], config: { ...s[i].config }, title: `${s[i].title || "Untitled"} (copy)` }, ...s.slice(i + 1)]);
  const delStep = (i: number) => setSteps((s) => s.length > 1 ? s.filter((_, idx) => idx !== i) : s);
  const move = (from: number, to: number) => setSteps((s) => { const a = [...s]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });

  const submit = () => {
    if (!name.trim()) return;
    const tasks = steps.map((s, i) => ({
      title: s.title.trim() || "Untitled step", description: s.description || undefined,
      assigneeRole: s.assigneeRole, dueInDays: s.dueInDays, category: TYPES[s.stepType].category,
      isMandatory: s.isMandatory, sortOrder: i, stepType: s.stepType, config: s.config,
      dependencies: s.dependencies || undefined, reminder: s.reminder || undefined,
      visibility: s.visibility || undefined, notes: s.notes || undefined,
    }));
    const body = { name: name.trim(), description: description || null, isActive: true, tasks };
    if (editingId) updateMut.mutate({ id: editingId, b: body }); else createMut.mutate(body);
  };

  const templates = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3"><ListChecks className="text-[#22c55e]" /><h1 className="text-page-title text-gray-900">Onboarding Templates</h1></div>
        <button onClick={openCreate} className="flex items-center gap-2 btn btn-primary"><Plus size={13} /> New Template</button>
      </div>

      {isLoading ? <SkeletonCards count={4} /> : templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500"><ListChecks size={32} className="mx-auto mb-2 text-gray-300" /> No templates yet</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t, i) => (
            <div key={t.id} className="row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4" style={{ ["--i" as never]: Math.min(i, 10) }}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-[13px] font-semibold text-gray-900">{t.name}</h3>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => openEdit(t)} title="Edit" className="p-1 text-gray-400 hover:text-[#16a34a] hover:bg-gray-100 rounded"><Pencil size={13} /></button>
                  <button onClick={() => { if (window.confirm(`Delete "${t.name}"?`)) deleteMut.mutate(t.id); }} title="Delete" className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded"><Trash2 size={13} /></button>
                </div>
              </div>
              {t.description && <p className="text-xs text-gray-500 mb-2">{t.description}</p>}
              <div className="text-xs text-gray-500">{(t.tasks ?? []).length} steps</div>
              <div className="mt-2 space-y-0.5">
                {(t.tasks ?? []).slice(0, 4).map((tk, j) => (
                  <div key={j} className="text-xs text-gray-600 flex items-center gap-2"><span className="text-gray-400">•</span><span className="truncate">{tk.title}</span><span className="text-gray-400 ml-auto shrink-0">{tk.stepType ? TYPES[(tk.stepType as StepType)]?.label ?? tk.stepType : tk.category}</span></div>
                ))}
                {(t.tasks ?? []).length > 4 && <div className="text-xs text-gray-400">+{t.tasks.length - 4} more</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="4xl" headerIcon={<FileText size={18} />}
        title={editingId ? "Edit Onboarding Template" : "Create Onboarding Template"} subtitle="Build a structured onboarding journey for new hires" bodyClassName="p-0 overflow-hidden">
        <div>
          <div className="p-5 max-h-[72vh] overflow-y-auto space-y-6">
            {/* Template details */}
            <section className="space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Template Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-4"><label className="block text-xs font-semibold text-gray-700 mb-1.5">Template Name <span className="text-red-500">*</span></label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering — New Hire" className={INPUT} /></div>
                <div className="sm:col-span-8"><label className="block text-xs font-semibold text-gray-700 mb-1.5">Description (optional)</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a short description…" className={INPUT} /></div>
              </div>
            </section>

            {/* Steps */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-sm font-bold text-gray-900">Onboarding Steps</h2><p className="text-[11px] text-gray-500">Drag to reorder · click a step to expand.</p></div>
                <button onClick={addStep} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100"><Plus size={14} /> Add Step</button>
              </div>

              <div className="space-y-2.5">
                {steps.map((s, i) => (
                  <StepCard
                    key={i} index={i} step={s} open={!!open[i]}
                    onToggle={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                    onPatch={(p) => patch(i, p)} onPatchConfig={(k, v) => patchConfig(i, k, v)}
                    onDup={() => dupStep(i)} onDel={() => delStep(i)} canDelete={steps.length > 1}
                    dragging={dragIdx === i} over={overIdx === i}
                    onDragStart={() => setDragIdx(i)} onDragEnter={() => setOverIdx(i)}
                    onDrop={() => { if (dragIdx !== null && dragIdx !== i) move(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  />
                ))}
                <button onClick={addStep} className="w-full border border-dashed border-gray-300 rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50">
                  <span className="w-8 h-8 rounded-full bg-violet-50 text-violet-600 grid place-items-center shrink-0"><Plus size={16} /></span>
                  <span><span className="block text-[13px] font-semibold text-gray-800">Add more steps</span><span className="block text-[11px] text-gray-500">Tasks, approvals, emails, forms, e-sign, training and more</span></span>
                </button>
              </div>
            </section>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-gray-200 bg-white">
          <button type="button" className="mr-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold">Preview Template</button>
          <button type="button" onClick={() => setShowCreate(false)} className="px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !name.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold disabled:opacity-60"><Check size={14} /> {saving ? "Saving…" : editingId ? "Save changes" : "Create Template"}</button>
        </div>
      </Modal>
    </div>
  );
}

function StepCard({ index, step, open, onToggle, onPatch, onPatchConfig, onDup, onDel, canDelete, dragging, over, onDragStart, onDragEnter, onDrop, onDragEnd }: {
  index: number; step: Step; open: boolean; onToggle: () => void;
  onPatch: (p: Partial<Step>) => void; onPatchConfig: (k: string, v: unknown) => void;
  onDup: () => void; onDel: () => void; canDelete: boolean;
  dragging: boolean; over: boolean; onDragStart: () => void; onDragEnter: () => void; onDrop: () => void; onDragEnd: () => void;
}) {
  const [adv, setAdv] = useState(false);
  const def = TYPES[step.stepType];

  // Assign-to uses departments + a dependent employee list. Stored in the
  // step's `config` (config.assignDepartmentId / config.assignEmployeeId).
  const api = useApiClient();
  const { data: deptResp } = useDepartments();
  const deptOpts = ((deptResp?.data ?? []) as { id: string; name?: string }[]).map((d) => ({ value: d.id, label: d.name ?? d.id }));
  const { data: empResp } = useQuery({
    queryKey: ["org-chart"],
    queryFn: () => api.get<{ employees: { id: string; firstName: string; lastName: string; department: { id: string; name: string } | null }[] }>("/api/v1/hrms/org-chart"),
  });
  const employees = empResp?.data?.employees ?? [];
  const assignDeptId = (step.config.assignDepartmentId as string) ?? "";
  const isCandidate = assignDeptId === CANDIDATE;
  const assignEmployeeId = (step.config.assignEmployeeId as string) ?? "";
  const deptEmployees = assignDeptId && !isCandidate ? employees.filter((e) => e.department?.id === assignDeptId) : [];
  const deptName = isCandidate ? "Candidate" : deptOpts.find((d) => d.value === assignDeptId)?.label;
  const empName = (() => { const e = employees.find((x) => x.id === assignEmployeeId); return e ? `${e.firstName} ${e.lastName}`.trim() : null; })();
  // Document Upload — list of documents the assignee (candidate) must upload.
  const docs = (Array.isArray(step.config.documents) ? step.config.documents : []) as string[];
  const setDocs = (next: string[]) => onPatchConfig("documents", next);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragEnter(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      className={clsx("border rounded-xl bg-white shadow-sm overflow-hidden transition", over ? "border-green-500 ring-2 ring-green-500/20" : "border-gray-200", dragging && "opacity-50")}
    >
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onToggle(); }}>
        <GripVertical size={15} className="text-gray-300 shrink-0 cursor-grab" />
        <span className="w-6 h-6 rounded-md bg-green-50 text-green-700 grid place-items-center text-xs font-bold shrink-0">{index + 1}</span>
        <span className="text-[13.5px] font-semibold flex-1 min-w-0 truncate">{step.title || "Untitled step"}</span>
        <span className={clsx("text-[10.5px] font-bold px-2 py-1 rounded-full shrink-0", TAG[def.color])}>{def.label}</span>
        <span className="text-[11px] text-gray-400 shrink-0 hidden sm:inline">{[deptName, empName].filter(Boolean).join(" · ") || "Unassigned"}</span>
        <span className="flex gap-0.5 shrink-0">
          <button title="Duplicate" onClick={onDup} className="w-7 h-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 grid place-items-center"><Copy size={14} /></button>
          {canDelete && <button title="Delete" onClick={onDel} className="w-7 h-7 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 grid place-items-center"><Trash2 size={14} /></button>}
          <button title="Collapse" onClick={onToggle} className="w-7 h-7 rounded-md text-gray-400 hover:bg-gray-100 grid place-items-center"><ChevronDown size={16} className={clsx("transition", open && "rotate-180")} /></button>
        </span>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.2fr_1.4fr] gap-3 pt-4">
            <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Step Title</label>
              <input value={step.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder="Step title" className={INPUT} /></div>
            <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Step Type</label>
              <Select size="sm" value={step.stepType} onChange={(v) => onPatch({ stepType: v as StepType, config: {} })} options={STEP_TYPE_KEYS.map((k) => ({ value: k, label: TYPES[k].label }))} /></div>
            <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Assign To</label>
              <Select size="sm" value={assignDeptId} onChange={(v) => { onPatchConfig("assignDepartmentId", v); onPatchConfig("assignEmployeeId", ""); }}
                options={[{ value: "", label: "Select…" }, { value: CANDIDATE, label: "Candidate (the new hire)" }, ...deptOpts]} /></div>
            {!isCandidate && (
              <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Employee</label>
                <Select size="sm" value={assignEmployeeId} onChange={(v) => onPatchConfig("assignEmployeeId", v)}
                  options={[{ value: "", label: assignDeptId ? "Any / select employee" : "Select a department first" }, ...deptEmployees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() }))]} /></div>
            )}
          </div>

          {step.stepType === "DocumentUpload" && (
            <div className="mt-3 p-3.5 border border-dashed border-gray-300 rounded-lg bg-gray-50/70">
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Documents to collect</div>
                <button type="button" onClick={() => setDocs([...docs, ""])} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline"><Plus size={13} /> Add document</button>
              </div>
              {docs.length === 0 && <p className="text-[12px] text-gray-400">No documents yet. Add the ones the candidate must upload (e.g. PAN, Aadhaar, Degree Certificate).</p>}
              <div className="space-y-2">
                {docs.map((d, di) => (
                  <div key={di} className="flex items-center gap-2">
                    <input value={d} onChange={(e) => setDocs(docs.map((x, xi) => (xi === di ? e.target.value : x)))} placeholder={`Document ${di + 1} name`} className={clsx(INPUT, "py-1.5")} />
                    <button type="button" onClick={() => setDocs(docs.filter((_, xi) => xi !== di))} className="w-8 h-8 shrink-0 grid place-items-center text-gray-400 hover:text-red-500 rounded-md"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              {isCandidate && <p className="text-[11px] text-gray-500 mt-2.5">The candidate will get an upload request email (sent from the onboarding checklist) and this task auto-completes once they upload.</p>}
            </div>
          )}

          {def.fields.length > 0 && (
            <div className="mt-3 p-3.5 border border-dashed border-gray-300 rounded-lg bg-gray-50/70">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-3">{def.label} settings</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {def.fields.map((f) => <DynField key={f.key} spec={f} value={step.config[f.key]} onChange={(v) => onPatchConfig(f.key, v)} />)}
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-gray-100 pt-2.5">
            <button onClick={() => setAdv((a) => !a)} className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700"><ChevronDown size={14} className={clsx("transition", adv && "rotate-180")} /> Advanced settings</button>
            {adv && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Dependencies</label>
                    <Select size="sm" value={step.dependencies ?? "None"} onChange={(v) => onPatch({ dependencies: v })} options={["None", "After previous step", "After all previous steps"].map((o) => ({ value: o, label: o }))} /></div>
                  <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Reminder</label>
                    <Select size="sm" value={step.reminder ?? "None"} onChange={(v) => onPatch({ reminder: v })} options={["None", "1 day before due", "On due date", "Daily until done"].map((o) => ({ value: o, label: o }))} /></div>
                  <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Visibility</label>
                    <Select size="sm" value={step.visibility ?? "Everyone involved"} onChange={(v) => onPatch({ visibility: v })} options={["Everyone involved", "Assignee only", "HR only"].map((o) => ({ value: o, label: o }))} /></div>
                  <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Notes (internal)</label>
                    <input value={step.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value })} placeholder="Notes for HR / admins" className={INPUT} /></div>
                </div>
                <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Description (shown to assignee)</label>
                  <textarea rows={2} value={step.description ?? ""} onChange={(e) => onPatch({ description: e.target.value })} placeholder="Add details or instructions for this step…" className={clsx(INPUT, "resize-y")} /></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DynField({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  if (spec.kind === "toggle") {
    return (
      <div className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white">
        <span className="text-[12px] font-semibold text-gray-700">{spec.label}</span>
        <Toggle sm on={!!value} onChange={onChange} />
      </div>
    );
  }
  if (spec.kind === "select") {
    return (<div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">{spec.label}</label>
      <Select size="sm" value={(value as string) ?? spec.options?.[0] ?? ""} onChange={onChange} options={(spec.options ?? []).map((o) => ({ value: o, label: o }))} /></div>);
  }
  if (spec.kind === "search") {
    return (<div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">{spec.label}</label>
      <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
        <input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={spec.placeholder} className={clsx(INPUT, "pl-8")} /></div></div>);
  }
  return (<div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">{spec.label}</label>
    <input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={spec.placeholder} className={INPUT} /></div>);
}

function Toggle({ on, onChange, sm }: { on: boolean; onChange: (v: boolean) => void; sm?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={clsx("relative rounded-full transition shrink-0", sm ? "w-9 h-5" : "w-11 h-6", on ? "bg-green-500" : "bg-gray-300")}>
      <span className={clsx("absolute top-0.5 rounded-full bg-white shadow transition-all", sm ? "h-4 w-4" : "h-5 w-5", on ? (sm ? "left-[18px]" : "left-[22px]") : "left-0.5")} />
    </button>
  );
}
