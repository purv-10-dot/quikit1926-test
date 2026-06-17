"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Plus, ListChecks, X } from "lucide-react";
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
  const [form, setForm] = useState<{ name: string; description: string; departmentId: string; designationId: string; tasks: TaskTpl[] }>({
    name: "", description: "", departmentId: "", designationId: "",
    tasks: [{ title: "", assigneeRole: "HRRole", dueInDays: 3, category: "Documentation", isMandatory: true, sortOrder: 0 }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", "templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/onboarding/templates?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/onboarding/templates", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding", "templates"] }); setShowCreate(false); },
  });

  const addTask = () => setForm({ ...form, tasks: [...form.tasks, { title: "", assigneeRole: "HRRole", dueInDays: 7, category: "TaskOther", isMandatory: true, sortOrder: form.tasks.length }] });
  const removeTask = (idx: number) => setForm({ ...form, tasks: form.tasks.filter((_, i) => i !== idx) });
  const updateTask = (idx: number, patch: Partial<TaskTpl>) => setForm({ ...form, tasks: form.tasks.map((t, i) => i === idx ? { ...t, ...patch } : t) });

  const templates = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ListChecks className="text-[#3b82f6]" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Onboarding Templates</h1>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 btn btn-primary">
          <Plus size={16} /> New Template
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
                <h3 className="font-medium text-gray-900">{t.name}</h3>
                <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", t.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                  {t.isActive ? "Active" : "Inactive"}
                </span>
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Onboarding Template">
        <form onSubmit={(e) => {
          e.preventDefault();
          createMut.mutate({ ...form, departmentId: form.departmentId || null, designationId: form.designationId || null, tasks: form.tasks });
        }} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Department (optional)</label>
              <input value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Tasks ({form.tasks.length})</label>
              <button type="button" onClick={addTask} className="text-xs text-[#3b82f6] hover:underline">+ Add task</button>
            </div>
            <div className="space-y-2">
              {form.tasks.map((t, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[#dbeafe] text-[#2563eb] rounded text-xs font-bold">#{idx + 1}</span>
                    <input required placeholder="Task title" value={t.title} onChange={(e) => updateTask(idx, { title: e.target.value })}
                      className="flex-1 border border-[var(--border)] rounded px-2 py-1.5 text-sm" />
                    {form.tasks.length > 1 && <button type="button" onClick={() => removeTask(idx)} className="text-red-500"><X size={14} /></button>}
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
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb]">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
