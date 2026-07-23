"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { clsx } from "clsx";

type Category = "AssetReturn" | "AccessRevoke" | "KnowledgeTransfer" | "Clearance";
const CATEGORY_OPTS: { value: Category; label: string }[] = [
  { value: "Clearance", label: "Clearance" },
  { value: "AssetReturn", label: "Asset Return" },
  { value: "AccessRevoke", label: "Access Revoke" },
  { value: "KnowledgeTransfer", label: "Knowledge Transfer" },
];

interface TaskRow { title: string; description: string; category: Category; department: string }
interface Template {
  id: string;
  name: string;
  description: string | null;
  tasks: TaskRow[];
  isActive: boolean;
}
interface FormState { name: string; description: string; isActive: boolean; tasks: TaskRow[] }

const emptyTask = (): TaskRow => ({ title: "", description: "", category: "Clearance", department: "" });
const emptyForm: FormState = { name: "", description: "", isActive: true, tasks: [emptyTask()] };

export default function OffboardingTemplatesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; item: Template | null }>({ open: false, item: null });
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["offboarding-templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/offboarding/templates?limit=100"),
  });
  const all = data?.data ?? [];
  const rows = search.trim() ? all.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())) : all;

  const buildBody = (f: FormState) => ({
    name: f.name,
    description: f.description || undefined,
    isActive: f.isActive,
    tasks: f.tasks
      .filter((t) => t.title.trim())
      .map((t, i) => ({ title: t.title.trim(), description: t.description || undefined, category: t.category, department: t.department || undefined, sortOrder: i })),
  });

  const createMut = useMutation({
    mutationFn: (body: ReturnType<typeof buildBody>) => api.post("/api/v1/hrms/offboarding/templates", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding-templates"] }); setModal({ open: false, item: null }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReturnType<typeof buildBody> }) => api.patch(`/api/v1/hrms/offboarding/templates/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding-templates"] }); setModal({ open: false, item: null }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/offboarding/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offboarding-templates"] }),
  });

  const columns: Column<Template>[] = [
    { key: "name", label: "Template Name" },
    { key: "description", label: "Description", render: (t) => t.description || "—" },
    { key: "tasks", label: "Tasks", render: (t) => (Array.isArray(t.tasks) ? t.tasks.length : 0) },
    { key: "isActive", label: "Status", render: (t) => (
      <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", t.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
        {t.isActive ? "Active" : "Inactive"}
      </span>
    ) },
  ];

  const openAdd = () => { setForm(emptyForm); setModal({ open: true, item: null }); };
  const openEdit = (t: Template) => {
    setForm({
      name: t.name,
      description: t.description ?? "",
      isActive: t.isActive,
      tasks: Array.isArray(t.tasks) && t.tasks.length ? t.tasks.map((x) => ({ title: x.title, description: x.description ?? "", category: (x.category ?? "Clearance") as Category, department: x.department ?? "" })) : [emptyTask()],
    });
    setModal({ open: true, item: t });
  };

  const setTask = (i: number, patch: Partial<TaskRow>) => setForm((f) => ({ ...f, tasks: f.tasks.map((t, x) => (x === i ? { ...t, ...patch } : t)) }));
  const addTask = () => setForm((f) => ({ ...f, tasks: [...f.tasks, emptyTask()] }));
  const removeTask = (i: number) => setForm((f) => ({ ...f, tasks: f.tasks.filter((_, x) => x !== i) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = buildBody(form);
    if (!body.tasks.length) { alert("Add at least one task."); return; }
    modal.item ? updateMut.mutate({ id: modal.item.id, body }) : createMut.mutate(body);
  };

  return (
    <div className="w-full px-1 py-1">
      <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-[#22c55e] hover:underline mb-4">
        <ArrowLeft size={14} /> Back to settings
      </Link>

      <CrudTable title="Offboarding Templates" data={rows} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search templates..." />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Template" : "Add Template"}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              placeholder="e.g. Standard Exit Clearance"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">Tasks</label>
              <button type="button" onClick={addTask} className="inline-flex items-center gap-1 text-xs font-semibold text-[#16a34a] hover:underline"><Plus size={13} /> Add task</button>
            </div>
            <div className="space-y-2">
              {form.tasks.map((t, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start rounded-lg border border-gray-100 bg-gray-50/60 p-2">
                  <input value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} placeholder="Task title"
                    className="col-span-5 border border-[var(--border)] rounded-md px-2 py-1.5 text-xs bg-white" />
                  <div className="col-span-4">
                    <Select value={t.category} onChange={(v) => setTask(i, { category: v as Category })} options={CATEGORY_OPTS} size="sm" />
                  </div>
                  <input value={t.department} onChange={(e) => setTask(i, { department: e.target.value })} placeholder="Dept (optional)"
                    className="col-span-2 border border-[var(--border)] rounded-md px-2 py-1.5 text-xs bg-white" />
                  <button type="button" onClick={() => removeTask(i)} disabled={form.tasks.length === 1}
                    className="col-span-1 h-8 inline-flex items-center justify-center text-gray-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded text-green-600" />
            Active
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, item: null })}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">{modal.item ? "Update" : "Create"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
