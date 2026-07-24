"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { useDepartments, useDesignations } from "@/lib/hooks/use-ref-data";
import { EMAIL_EVENTS } from "@/lib/email/registry";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { clsx } from "clsx";
import {
  Plus, ListChecks, Pencil, Trash2, FileText, GripVertical,
  Check, ChevronDown, Copy, Search, X, AlertTriangle,
} from "lucide-react";

type Category = "Documentation" | "ItSetup" | "Training" | "Compliance" | "Introduction" | "TaskOther";
type AssigneeRole = "ReportingManagerRole" | "HRRole" | "ITRole" | "FinanceRole" | "AdminRole" | "EmployeeRole" | "CustomRole";
type StepType =
  | "CustomTask" | "CompleteProfile" | "DocumentUpload" | "SendEmail" | "Approval" | "FillForm"
  | "ReadPolicy" | "Training" | "ITProvisioning" | "AssetAssignment";

type FieldKind = "text" | "select" | "search" | "toggle" | "emailTemplate";

// Curated list of emails you'd actually send TO a new hire during onboarding
// (welcome, invite, confirmation, joining letter, tax-doc ack). Recruitment
// pipeline noise (interview/application/rejection) and Leave/WFH/Payroll are excluded.
const ONBOARDING_EMAIL_KEYS = new Set([
  "employee.welcome",
  "employee.invite",
  "employee.confirmation",
  "form12bb.ack",
]);
const EMAIL_TEMPLATE_OPTIONS = [
  // Joining letter is a generated PDF, not a registry email — sent as an attachment.
  { value: "onboarding.joining-letter", label: "Joining Letter (PDF attached)" },
  ...[...EMAIL_EVENTS]
    .filter((e) => ONBOARDING_EMAIL_KEYS.has(e.key))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((e) => ({ value: e.key, label: e.label })),
];
interface FieldSpec { key: string; label: string; kind: FieldKind; options?: string[]; placeholder?: string; }
interface TypeDef { label: string; color: "gray" | "blue" | "amber" | "violet" | "green"; category: Category; fields: FieldSpec[]; }
// A file HR attaches on a Policy / Training step for the candidate to acknowledge.
interface PolicyFile { url: string; key?: string; fileName: string; fileType?: string; fileSize?: number }
// One item on an Asset Assignment step (custom = free-text name when type is "Custom").
interface AssetRow { type: string; qty: number; custom?: string }

const TYPES: Record<StepType, TypeDef> = {
  CustomTask:      { label: "Custom Task",      color: "gray",   category: "TaskOther",     fields: [] },
  // The new hire (or HR) fills the missing mandatory profile fields — DOB,
  // gender, address, emergency contact, PAN/Aadhaar, reporting manager — from a
  // form on the onboarding page. Saved straight to the employee record.
  CompleteProfile: { label: "Complete Profile", color: "violet", category: "TaskOther", fields: [] },
  // Document Upload uses a custom "list of documents" editor (see StepCard),
  // not the generic settings fields.
  DocumentUpload:  { label: "Document Upload",  color: "blue",   category: "Documentation", fields: [] },
  // Uses a custom multi-select (see StepCard) so HR can send several email
  // templates in one step, plus a CC field — not the single generic fields.
  SendEmail:       { label: "Send Email",       color: "amber",  category: "Introduction",  fields: [] },
  Approval:        { label: "Approval",         color: "violet", category: "Compliance",    fields: [
    { key: "approver", label: "Approver", kind: "search", placeholder: "Search users / roles…" },
    { key: "escalation", label: "Escalation", kind: "select", options: ["None", "After 2 days → HR Head", "After 1 day → Manager"] },
    { key: "autoApprove", label: "Auto approve after", kind: "text", placeholder: "e.g. 5 days" },
  ] },
  FillForm:        { label: "Fill Form",        color: "blue",   category: "Documentation", fields: [
    { key: "form", label: "Form Template", kind: "search", placeholder: "Search forms…" },
    { key: "required", label: "Required", kind: "toggle" },
  ] },
  // Merged "Read Policy" + "Training". HR attaches the policy/training files
  // (PDF/image); the candidate reads & acknowledges each via a secure link.
  // Uses a custom file uploader (see StepCard), not the generic fields.
  // Always assigned to the candidate — locked in the builder.
  ReadPolicy:      { label: "Policy / Training", color: "blue",   category: "Compliance",    fields: [] },
  Training:        { label: "Training",         color: "green",  category: "Training",      fields: [
    { key: "course", label: "Course / Module", kind: "search", placeholder: "Search courses…" },
    { key: "duration", label: "Duration", kind: "text", placeholder: "e.g. 2 hours" },
    { key: "passing", label: "Passing score", kind: "text", placeholder: "e.g. 70%" },
  ] },
  // Uses a custom multi-select grid (see StepCard) so HR can pick several systems
  // to provision. Owner is the "Assign To" above — no separate owner field.
  ITProvisioning:  { label: "IT Provisioning",  color: "gray",   category: "ItSetup",       fields: [] },
  // Uses a custom "assets to assign" list editor (see StepCard) so HR can add
  // multiple items, each with its own quantity — not the single generic fields.
  AssetAssignment: { label: "Asset Assignment", color: "gray",   category: "ItSetup",       fields: [] },
};

// Asset types for the Asset Assignment list editor ("Custom" reveals a free-text name).
const ASSET_TYPES = [
  "Laptop", "Desktop / Workstation", "Monitor", "Docking Station",
  "Keyboard", "Mouse", "Headset", "Webcam",
  "Mobile Phone", "SIM Card", "Desk Phone", "Tablet",
  "Access Card / ID Badge", "Laptop Bag", "Charger / Adapter",
  "External Storage / Hard Drive", "USB Drive",
  "Software License", "VPN Token / Security Key",
  "Custom",
];

// Systems / access options for the IT Provisioning multi-select grid.
const IT_SYSTEMS = [
  "Email Account", "SSO / Identity", "VPN Access",
  "Code Repository", "Cloud Console", "Jira / Confluence",
  "Slack / Teams", "CRM / ERP", "Database Access",
  "Shared Drives", "Admin / Server", "Password Manager",
];
// "Complete Profile" is NOT selectable here — it's a mandatory system step that
// every onboarding always gets automatically (injected server-side). Kept in
// TYPES only so existing tasks still render their label.
const HIDDEN_STEP_TYPES: StepType[] = ["CompleteProfile", "Approval", "FillForm", "Training"];
const STEP_TYPE_KEYS = (Object.keys(TYPES) as StepType[]).filter((k) => !HIDDEN_STEP_TYPES.includes(k));

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
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Step[]>([newStep()]);
  // Only ONE step is open at a time. Opening/adding a step auto-closes the rest;
  // collapsed steps tile in a grid, the open one spans full width.
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const reset = () => { setName(""); setDescription(""); setSteps([newStep()]); setOpenIdx(0); };
  const openCreate = () => { setEditingId(null); reset(); setShowCreate(true); };
  const openEdit = (t: Template) => {
    setEditingId(t.id); setName(t.name); setDescription(t.description ?? "");
    setSteps((t.tasks ?? []).length ? (t.tasks ?? []).map(toStep) : [newStep()]);
    setOpenIdx(0); setShowCreate(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", "templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/onboarding/templates?limit=100"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["onboarding", "templates"] });
  const createMut = useMutation({ mutationFn: (b: Record<string, unknown>) => api.post("/api/v1/hrms/onboarding/templates", b), onSuccess: () => { invalidate(); setShowCreate(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, b }: { id: string; b: Record<string, unknown> }) => api.put(`/api/v1/hrms/onboarding/templates/${id}`, b), onSuccess: () => { invalidate(); setShowCreate(false); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => api.delete(`/api/v1/hrms/onboarding/templates/${id}`), onSuccess: () => invalidate(), onSettled: () => setDeleteTarget(null) });
  const saving = createMut.isPending || updateMut.isPending;

  const patch = (i: number, p: Partial<Step>) => setSteps((s) => s.map((st, idx) => idx === i ? { ...st, ...p } : st));
  const patchConfig = (i: number, key: string, v: unknown) => setSteps((s) => s.map((st, idx) => idx === i ? { ...st, config: { ...st.config, [key]: v } } : st));
  const addStep = () => setSteps((s) => { setOpenIdx(s.length); return [...s, newStep()]; });
  const dupStep = (i: number) => setSteps((s) => { setOpenIdx(i + 1); return [...s.slice(0, i + 1), { ...s[i], config: { ...s[i].config }, title: `${s[i].title || "Untitled"} (copy)` }, ...s.slice(i + 1)]; });
  const delStep = (i: number) => setSteps((s) => {
    if (s.length <= 1) return s;
    setOpenIdx((cur) => (cur === null ? null : cur === i ? null : cur > i ? cur - 1 : cur));
    return s.filter((_, idx) => idx !== i);
  });
  const move = (from: number, to: number) => setSteps((s) => { const a = [...s]; const [x] = a.splice(from, 1); a.splice(to, 0, x); setOpenIdx((cur) => (cur === from ? to : cur)); return a; });

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
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3"><ListChecks className="text-[#22c55e]" /><h1 className="text-page-title text-gray-900">Onboarding Templates</h1></div>
        <button onClick={openCreate} className="flex items-center gap-2 btn btn-primary"><Plus size={13} /> New Template</button>
      </div>

      {isLoading ? <SkeletonCards count={4} /> : templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500"><ListChecks size={32} className="mx-auto mb-2 text-gray-300" /> No templates yet</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t, i) => (
            <div key={t.id} onClick={() => openEdit(t)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(t); } }}
              className="row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4 cursor-pointer hover:border-[#166534]/30 hover:shadow-md transition" style={{ ["--i" as never]: Math.min(i, 10) }}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-[13px] font-semibold text-gray-900">{t.name}</h3>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(t)} title="Edit" className="p-1 text-gray-400 hover:text-[#16a34a] hover:bg-gray-100 rounded"><Pencil size={13} /></button>
                  <button onClick={() => setDeleteTarget(t)} title="Delete" className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded"><Trash2 size={13} /></button>
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="3xl" headerIcon={<FileText size={18} />}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-start">
                {steps.map((s, i) => (
                  <StepCard
                    key={i} index={i} step={s} open={openIdx === i}
                    onToggle={() => setOpenIdx((cur) => (cur === i ? null : i))}
                    onPatch={(p) => patch(i, p)} onPatchConfig={(k, v) => patchConfig(i, k, v)}
                    onDup={() => dupStep(i)} onDel={() => delStep(i)} canDelete={steps.length > 1}
                    dragging={dragIdx === i} over={overIdx === i}
                    onDragStart={() => setDragIdx(i)} onDragEnter={() => setOverIdx(i)}
                    onDrop={() => { if (dragIdx !== null && dragIdx !== i) move(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  />
                ))}
              </div>
            </section>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-gray-200 bg-white">
          <button type="button" onClick={() => setShowCreate(false)} className="ml-auto px-3.5 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !name.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold disabled:opacity-60"><Check size={14} /> {saving ? "Saving…" : editingId ? "Save changes" : "Create Template"}</button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !deleteMut.isPending && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-red-50 ring-4 ring-red-50/60">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">Delete template?</h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    <span className="font-medium text-slate-700">&ldquo;{deleteTarget.name}&rdquo;</span> will be removed. Onboardings already using it are not affected. A template that is currently in use can&apos;t be deleted.
                  </p>
                </div>
                <button onClick={() => setDeleteTarget(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteMut.isPending}
                  className="px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm disabled:opacity-50">
                  {deleteMut.isPending ? "Deleting…" : <><Trash2 size={13} /> Delete</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({ index, step, open, onToggle, onPatch, onPatchConfig, onDup, onDel, canDelete, dragging, over, onDragStart, onDragEnter, onDrop, onDragEnd }: {
  index: number; step: Step; open: boolean; onToggle: () => void;
  onPatch: (p: Partial<Step>) => void; onPatchConfig: (k: string, v: unknown) => void;
  onDup: () => void; onDel: () => void; canDelete: boolean;
  dragging: boolean; over: boolean; onDragStart: () => void; onDragEnter: () => void; onDrop: () => void; onDragEnd: () => void;
}) {
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
  // Policy / Training steps are always the candidate's — Assign To is locked.
  const isReadPolicy = step.stepType === "ReadPolicy";
  const isCandidate = assignDeptId === CANDIDATE || isReadPolicy;
  // A step can be assigned to MULTIPLE employees (all get notified + emailed).
  // Stored in config.assignEmployeeIds; falls back to the legacy single id.
  const assignEmployeeIds = (Array.isArray(step.config.assignEmployeeIds)
    ? (step.config.assignEmployeeIds as string[])
    : (step.config.assignEmployeeId ? [step.config.assignEmployeeId as string] : [])).filter(Boolean);
  const toggleEmp = (id: string) => {
    const next = assignEmployeeIds.includes(id) ? assignEmployeeIds.filter((x) => x !== id) : [...assignEmployeeIds, id];
    onPatchConfig("assignEmployeeIds", next);
    onPatchConfig("assignEmployeeId", next[0] ?? ""); // keep legacy single in sync
  };
  const deptEmployees = assignDeptId && !isCandidate ? employees.filter((e) => e.department?.id === assignDeptId) : [];
  const deptName = isCandidate ? "Candidate" : deptOpts.find((d) => d.value === assignDeptId)?.label;
  const empName = (() => {
    const names = assignEmployeeIds
      .map((id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}`.trim() : null; })
      .filter(Boolean) as string[];
    if (names.length === 0) return null;
    return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
  })();
  // Document Upload — list of documents the assignee (candidate) must upload.
  const docs = (Array.isArray(step.config.documents) ? step.config.documents : []) as string[];
  const setDocs = (next: string[]) => onPatchConfig("documents", next);
  // Policy / Training — files HR attaches for the candidate to read & acknowledge.
  const files = (Array.isArray(step.config.files) ? step.config.files : []) as PolicyFile[];
  const setFiles = (next: PolicyFile[]) => onPatchConfig("files", next);
  // Asset Assignment — list of assets (each with a quantity) to hand over.
  const assets = (Array.isArray(step.config.assets) ? step.config.assets : []) as AssetRow[];
  const setAssets = (next: AssetRow[]) => onPatchConfig("assets", next);
  const patchAsset = (i: number, p: Partial<AssetRow>) => setAssets(assets.map((x, xi) => (xi === i ? { ...x, ...p } : x)));
  // IT Provisioning — multiple systems to provision (+ free-text "other").
  const systems = (Array.isArray(step.config.systems) ? step.config.systems : []) as string[];
  const otherSystems = (step.config.otherSystems as string) ?? "";
  const toggleSystem = (s: string) => onPatchConfig("systems", systems.includes(s) ? systems.filter((x) => x !== s) : [...systems, s]);
  // Send Email — multiple email templates to send + CC.
  const emailTemplates = (Array.isArray(step.config.templates) ? step.config.templates : []) as string[];
  const toggleTemplate = (k: string) => onPatchConfig("templates", emailTemplates.includes(k) ? emailTemplates.filter((x) => x !== k) : [...emailTemplates, k]);
  const [uploadingPolicy, setUploadingPolicy] = useState(false);
  const uploadPolicyFiles = async (list: FileList) => {
    setUploadingPolicy(true);
    try {
      const added: PolicyFile[] = [];
      for (const file of Array.from(list)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api.upload<{ url: string; key: string; fileName: string; fileType: string; fileSize: number }>("/api/v1/hrms/uploads", fd);
        added.push({ url: res.data.url, key: res.data.key, fileName: res.data.fileName, fileType: res.data.fileType, fileSize: res.data.fileSize });
      }
      setFiles([...files, ...added]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingPolicy(false);
    }
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragEnter(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      style={{ gridColumn: open ? "1 / -1" : undefined }}
      className={clsx("border rounded-xl bg-white overflow-hidden transition",
        over ? "border-green-500 ring-2 ring-green-500/20"
          : open ? "border-green-500 shadow-md"
          : "border-gray-200 shadow-sm hover:border-green-200 hover:shadow",
        dragging && "opacity-50")}
    >
      {open ? (
        <div className="flex items-center gap-3 p-3 cursor-pointer bg-gradient-to-b from-green-50 to-white" onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onToggle(); }}>
          <GripVertical size={15} className="text-gray-300 shrink-0 cursor-grab" />
          <span className="w-6 h-6 rounded-md bg-green-600 text-white grid place-items-center text-xs font-bold shrink-0">{index + 1}</span>
          <span className="text-[14px] font-bold flex-1 min-w-0 truncate">{step.title || "Untitled step"}</span>
          <span className={clsx("text-[10.5px] font-bold px-2 py-1 rounded-full shrink-0", TAG[def.color])}>{def.label}</span>
          <span className="text-[11px] text-gray-400 shrink-0 hidden sm:inline">{[deptName, empName].filter(Boolean).join(" · ") || "Unassigned"}</span>
          <span className="flex gap-0.5 shrink-0">
            <button title="Duplicate" onClick={onDup} className="w-7 h-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 grid place-items-center"><Copy size={14} /></button>
            {canDelete && <button title="Delete" onClick={onDel} className="w-7 h-7 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 grid place-items-center"><Trash2 size={14} /></button>}
            <button title="Collapse" onClick={onToggle} className="w-7 h-7 rounded-md text-gray-400 hover:bg-gray-100 grid place-items-center"><ChevronDown size={16} className="rotate-180 transition" /></button>
          </span>
        </div>
      ) : (
        <div className="p-3 cursor-pointer flex flex-col gap-2 min-h-[84px]" onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onToggle(); }}>
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="text-gray-300 shrink-0 cursor-grab" />
            <span className="w-[22px] h-[22px] rounded-md bg-green-50 text-green-700 grid place-items-center text-[11px] font-bold shrink-0">{index + 1}</span>
            <span className="text-[13px] font-semibold flex-1 min-w-0 truncate">{step.title || "Untitled step"}</span>
            <ChevronDown size={15} className="text-gray-300 shrink-0" />
          </div>
          <div className="flex items-center gap-2 flex-wrap pl-[30px]">
            <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", TAG[def.color])}>{def.label}</span>
            <span className="text-[11px] text-gray-400 truncate min-w-0">{[deptName, empName].filter(Boolean).join(" · ") || "Unassigned"}</span>
            <span className="ml-auto flex gap-0.5 shrink-0">
              <button title="Duplicate" onClick={onDup} className="w-6 h-6 rounded-md text-gray-300 hover:bg-gray-100 hover:text-gray-600 grid place-items-center"><Copy size={12} /></button>
              {canDelete && <button title="Delete" onClick={onDel} className="w-6 h-6 rounded-md text-gray-300 hover:bg-red-50 hover:text-red-500 grid place-items-center"><Trash2 size={12} /></button>}
            </span>
          </div>
        </div>
      )}

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.2fr_1.4fr] gap-3 pt-4">
            <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Step Title</label>
              <input value={step.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder="Step title" className={INPUT} /></div>
            <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Step Type</label>
              <Select size="sm" value={step.stepType}
                onChange={(v) => { const st = v as StepType; onPatch({ stepType: st, config: st === "ReadPolicy" ? { assignDepartmentId: CANDIDATE } : {} }); }}
                options={STEP_TYPE_KEYS.map((k) => ({ value: k, label: TYPES[k].label }))} /></div>
            <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Assign To</label>
              <Select size="sm" disabled={isReadPolicy} value={isReadPolicy ? CANDIDATE : assignDeptId}
                onChange={(v) => { onPatchConfig("assignDepartmentId", v); onPatchConfig("assignEmployeeId", ""); }}
                options={[{ value: "", label: "Select…" }, { value: CANDIDATE, label: "Candidate (the new hire)" }, ...deptOpts]} />
              {isReadPolicy && <p className="text-[10px] text-gray-400 mt-1">Locked to the candidate for this step.</p>}</div>
            {!isCandidate && (
              <div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">Employees</label>
                {!assignDeptId ? (
                  <div className="text-[12px] text-gray-400 border border-gray-200 rounded-lg px-3 py-2">Select a department first</div>
                ) : deptEmployees.length === 0 ? (
                  <div className="text-[12px] text-gray-400 border border-gray-200 rounded-lg px-3 py-2">No employees in this department</div>
                ) : (
                  <div className="border border-gray-200 rounded-lg p-1.5 max-h-32 overflow-y-auto space-y-0.5 bg-white">
                    {deptEmployees.map((e) => {
                      const on = assignEmployeeIds.includes(e.id);
                      return (
                        <button type="button" key={e.id} onClick={() => toggleEmp(e.id)}
                          className={clsx("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12.5px]", on ? "bg-green-50 text-green-800" : "hover:bg-gray-50 text-gray-700")}>
                          <span className={clsx("w-4 h-4 rounded border grid place-items-center shrink-0", on ? "bg-green-600 border-green-600 text-white" : "border-gray-300")}>{on && <Check size={11} />}</span>
                          <span className="truncate">{`${e.firstName} ${e.lastName}`.trim()}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {assignEmployeeIds.length > 0 && <p className="text-[10px] text-gray-400 mt-1">{assignEmployeeIds.length} selected — all get notified &amp; emailed.</p>}
              </div>
            )}
          </div>

          {step.stepType === "DocumentUpload" && (
            <div className="mt-3 p-3.5 border border-dashed border-gray-300 rounded-lg bg-gray-50/70">
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Documents to collect</div>
                <button type="button" onClick={() => setDocs([...docs, ""])} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline"><Plus size={13} /> Add document</button>
              </div>
              {docs.length === 0 && <p className="text-[12px] text-gray-400">No documents yet. Add the ones the candidate must upload (e.g. PAN, Aadhaar, Degree Certificate).</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {docs.map((d, di) => (
                  <div key={di} className="flex items-center gap-2">
                    <input value={d} onChange={(e) => setDocs(docs.map((x, xi) => (xi === di ? e.target.value : x)))} placeholder={`Document ${di + 1} name`} className={clsx(INPUT, "py-1.5 flex-1 min-w-0")} />
                    <button type="button" onClick={() => setDocs(docs.filter((_, xi) => xi !== di))} className="w-8 h-8 shrink-0 grid place-items-center text-gray-400 hover:text-red-500 rounded-md"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              {isCandidate && <p className="text-[11px] text-gray-500 mt-2.5">The candidate will get an upload request email (sent from the onboarding checklist) and this task auto-completes once they upload.</p>}
            </div>
          )}

          {step.stepType === "ReadPolicy" && (
            <div className="mt-3 p-3.5 border border-dashed border-gray-300 rounded-lg bg-gray-50/70">
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Files to acknowledge (PDF / image)</div>
                <label className={clsx("inline-flex items-center gap-1 text-xs font-semibold cursor-pointer", uploadingPolicy ? "text-gray-400" : "text-green-700 hover:underline")}>
                  <Plus size={13} /> {uploadingPolicy ? "Uploading…" : "Add file"}
                  <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" disabled={uploadingPolicy}
                    onChange={(e) => { if (e.target.files?.length) uploadPolicyFiles(e.target.files); e.currentTarget.value = ""; }} />
                </label>
              </div>
              {files.length === 0 && <p className="text-[12px] text-gray-400">No files yet. Upload the policy / training documents the candidate must read and acknowledge.</p>}
              <div className="space-y-2">
                {files.map((f, fi) => (
                  <div key={fi} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <FileText size={14} className="text-gray-400 shrink-0" />
                    <span className="flex-1 min-w-0 text-[12.5px] text-gray-800 truncate">{f.fileName}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, xi) => xi !== fi))} className="w-7 h-7 shrink-0 grid place-items-center text-gray-400 hover:text-red-500 rounded-md"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-2.5">The candidate gets an email link (sent from the onboarding checklist) to view and acknowledge each file. The step completes when all are acknowledged.</p>
            </div>
          )}

          {step.stepType === "AssetAssignment" && (
            <div className="mt-3 p-3.5 border border-dashed border-gray-300 rounded-lg bg-gray-50/70">
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Assets to assign</div>
                <button type="button" onClick={() => setAssets([...assets, { type: "Laptop", qty: 1 }])} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline"><Plus size={13} /> Add asset</button>
              </div>
              {assets.length === 0 && <p className="text-[12px] text-gray-400">No assets yet. Add the equipment to hand over (e.g. Laptop, Monitor, Access Card).</p>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {assets.map((a, ai) => (
                  <div key={ai} className="flex items-center gap-2">
                    <Select size="sm" className="flex-1 min-w-0" value={a.type} onChange={(v) => patchAsset(ai, { type: v })} options={ASSET_TYPES.map((t) => ({ value: t, label: t }))} />
                    {a.type === "Custom" && (
                      <input value={a.custom ?? ""} onChange={(e) => patchAsset(ai, { custom: e.target.value })} placeholder="Asset name" className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-green-500/25 focus:border-green-500" />
                    )}
                    <input type="number" min={1} value={a.qty} onChange={(e) => patchAsset(ai, { qty: Math.max(1, Number(e.target.value) || 1) })} className="w-16 shrink-0 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-green-500/25 focus:border-green-500" title="Quantity" />
                    <button type="button" onClick={() => setAssets(assets.filter((_, xi) => xi !== ai))} className="w-8 h-8 shrink-0 grid place-items-center text-gray-400 hover:text-red-500 rounded-md"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step.stepType === "ITProvisioning" && (
            <div className="mt-3 p-3.5 border border-dashed border-gray-300 rounded-lg bg-gray-50/70">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-2.5">Systems / access to provision</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {IT_SYSTEMS.map((s) => {
                  const on = systems.includes(s);
                  return (
                    <button type="button" key={s} onClick={() => toggleSystem(s)}
                      className={clsx("flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-[12px]", on ? "bg-green-50 border-green-300 text-green-800" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700")}>
                      <span className={clsx("w-4 h-4 rounded border grid place-items-center shrink-0", on ? "bg-green-600 border-green-600 text-white" : "border-gray-300")}>{on && <Check size={11} />}</span>
                      <span className="truncate">{s}</span>
                    </button>
                  );
                })}
              </div>
              <input value={otherSystems} onChange={(e) => onPatchConfig("otherSystems", e.target.value)} placeholder="Other systems (comma-separated)" className={clsx(INPUT, "mt-2 py-1.5")} />
            </div>
          )}

          {step.stepType === "SendEmail" && (
            <div className="mt-3 p-3.5 border border-dashed border-gray-300 rounded-lg bg-gray-50/70">
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">Email templates to send</div>
                {emailTemplates.length > 0 && <span className="text-[10px] text-gray-400">{emailTemplates.length} selected</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                {EMAIL_TEMPLATE_OPTIONS.map((o) => {
                  const on = emailTemplates.includes(o.value);
                  return (
                    <button type="button" key={o.value} onClick={() => toggleTemplate(o.value)}
                      className={clsx("flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-[12px]", on ? "bg-green-50 border-green-300 text-green-800" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700")}>
                      <span className={clsx("w-4 h-4 rounded border grid place-items-center shrink-0", on ? "bg-green-600 border-green-600 text-white" : "border-gray-300")}>{on && <Check size={11} />}</span>
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500 mt-2.5">All ticked emails are sent to the recipient when this step runs. Customize any email&apos;s wording in Settings → Email Templates.</p>
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
  if (spec.kind === "emailTemplate") {
    return (<div><label className="block text-[10px] uppercase tracking-wide text-gray-400 font-bold mb-1">{spec.label}</label>
      <Select size="sm" value={(value as string) ?? ""} onChange={onChange}
        placeholder="Select an email template…" options={EMAIL_TEMPLATE_OPTIONS} /></div>);
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
