"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Plus, ListChecks, X, Pencil, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonCards } from "@/components/hrms/skeleton";

type Category = "Documentation" | "ItSetup" | "Training" | "Compliance" | "Introduction" | "TaskOther";
type AssigneeRole = "ReportingManagerRole" | "HRRole" | "ITRole" | "FinanceRole" | "AdminRole" | "EmployeeRole" | "CustomRole";

interface TaskTpl { title: string; description?: string; assigneeRole: AssigneeRole; dueInDays: number; category: Category; isMandatory: boolean; sortOrder: number; }
interface Template { id: string; name: string; description: string | null; departmentId: string | null; designationId: string | null; tasks: TaskTpl[]; isActive: boolean; createdAt: string; }

const CATEGORIES: Category[] = ["Documentation", "ItSetup", "Training", "Compliance", "Introduction", "TaskOther"];
const ROLES: AssigneeRole[] = ["ReportingManagerRole", "HRRole", "ITRole", "FinanceRole", "AdminRole", "EmployeeRole", "CustomRole"];

export default function OnboardingTemplatesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = {
    name: "", description: "", departmentId: "", designationId: "", isActive: true,
    tasks: [{ title: "", assigneeRole: "HRRole" as AssigneeRole, dueInDays: 3, category: "Documentation" as Category, isMandatory: true, sortOrder: 0 }] as TaskTpl[],
  };
  const [form, setForm] = useState<{ name: string; description: string; departmentId: string; designationId: string; isActive: boolean; tasks: TaskTpl[] }>(emptyForm);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowCreate(true); };
  const openEdit = (t: Template) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? "",
      departmentId: t.departmentId ?? "",
      designationId: t.designationId ?? "",
      isActive: t.isActive,
      tasks: (t.tasks ?? []).map((tk, i) => ({ ...tk, sortOrder: i })),
    });
    setShowCreate(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", "templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/onboarding/templates?limit=100"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["onboarding", "templates"] });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/onboarding/templates", body),
    onSuccess: () => { invalidate(); setShowCreate(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.put(`/api/v1/hrms/onboarding/templates/${id}`, body),
    onSuccess: () => { invalidate(); setShowCreate(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/onboarding/templates/${id}`),
    onSuccess: () => invalidate(),
  });
  const saving = createMut.isPending || updateMut.isPending;

  const addTask = () => setForm({ ...form, tasks: [...form.tasks, { title: "", assigneeRole: "HRRole", dueInDays: 7, category: "TaskOther", isMandatory: true, sortOrder: form.tasks.length }] });
  const removeTask = (idx: number) => setForm({ ...form, tasks: form.tasks.filter((_, i) => i !== idx) });
  const updateTask = (idx: number, patch: Partial<TaskTpl>) => setForm({ ...form, tasks: form.tasks.map((t, i) => i === idx ? { ...t, ...patch } : t) });

  const templates = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ListChecks className="text-[#22c55e]" />
          <h1 className="text-page-title text-gray-900">Onboarding Templates</h1>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 btn btn-primary">
          <Plus size={13} /> New Template
        </button>
      </div>

      {isLoading ? <SkeletonCards count={4} /> : templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <ListChecks size={32} className="mx-auto mb-2 text-gray-300" /> No templates yet
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t, i) => (
            <div key={t.id} className="row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4" style={{ ["--i" as never]: Math.min(i, 10) }}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-[13px] font-semibold text-gray-900">{t.name}</h3>
                <div className="flex items-center gap-1.5">
                  <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", t.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                    {t.isActive ? "Active" : "Inactive"}
                  </span>
                  <button type="button" onClick={() => openEdit(t)} title="Edit template"
                    className="p-1 text-gray-400 hover:text-[#16a34a] hover:bg-gray-100 rounded">
                    <Pencil size={13} />
                  </button>
                  <button type="button"
                    onClick={() => { if (window.confirm(`Delete template "${t.name}"? This can't be undone.`)) deleteMut.mutate(t.id); }}
                    title="Delete template"
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {t.description && <p className="text-xs text-gray-500 mb-2">{t.description}</p>}
              <div className="text-xs text-gray-500">{(t.tasks ?? []).length} tasks</div>
              <div className="mt-2 space-y-0.5">
                {(t.tasks ?? []).slice(0, 4).map((tk, i) => (
                  <div key={i} className="text-xs text-gray-600 flex items-center gap-2">
                    <span className="text-gray-400">•</span>
                    <span>{tk.title}</span>
                    <span className="text-gray-400 ml-auto">{tk.category}</span>
                  </div>
                ))}
                {(t.tasks ?? []).length > 4 && <div className="text-xs text-gray-400">+{t.tasks.length - 4} more</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="2xl" title={editingId ? "Edit Onboarding Template" : "New Onboarding Template"}>
        <form onSubmit={(e) => {
          e.preventDefault();
          const payload = { ...form, departmentId: form.departmentId || null, designationId: form.designationId || null, tasks: form.tasks };
          if (editingId) updateMut.mutate({ id: editingId, body: payload });
          else createMut.mutate(payload);
        }} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Department (optional)</label>
              <input value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>

          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active (available when initiating onboarding)
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700">Tasks ({form.tasks.length})</label>
              <button type="button" onClick={addTask} className="text-xs text-[#22c55e] hover:underline">+ Add task</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {form.tasks.map((t, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[#dcfce7] text-[#16a34a] rounded text-[11px] font-semibold">#{idx + 1}</span>
                    <input required placeholder="Task title" value={t.title} onChange={(e) => updateTask(idx, { title: e.target.value })}
                      className="flex-1 border border-[var(--border)] rounded px-2 py-1.5 text-xs" />
                    {form.tasks.length > 1 && <button type="button" onClick={() => removeTask(idx)} className="text-red-500"><X size={12} /></button>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select
                      value={t.category}
                      onChange={(v) => updateTask(idx, { category: v as Category })}
                      size="sm"
                      options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                    />
                    <Select
                      value={t.assigneeRole}
                      onChange={(v) => updateTask(idx, { assigneeRole: v as AssigneeRole })}
                      size="sm"
                      options={ROLES.map((r) => ({ value: r, label: r }))}
                    />
                    <NumberInput allowDecimal={false} placeholder="Due in days" value={t.dueInDays} onChange={(v) => updateTask(idx, { dueInDays: v ?? 0 })}
                      className="border border-[var(--border)] rounded px-2 py-1.5 text-xs" />
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={t.isMandatory} onChange={(e) => updateTask(idx, { isMandatory: e.target.checked })} /> Mandatory
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white">
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-60">
              {saving ? "Saving…" : editingId ? "Save changes" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
