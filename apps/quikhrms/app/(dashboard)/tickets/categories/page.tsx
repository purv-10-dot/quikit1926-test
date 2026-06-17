"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDepartments } from "@/lib/hooks/use-ref-data";
import { Modal } from "@/components/hrms/modal";
import { useDialog } from "@/components/hrms/dialog";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { EmptyState } from "@/components/hrms/empty-state";
import { Tag, Plus, Trash2, Edit2, Zap, Building2 } from "lucide-react";
import { clsx } from "clsx";

type Priority = "Low" | "Medium" | "High" | "Urgent";
const PRIORITIES: Priority[] = ["Urgent", "High", "Medium", "Low"];

interface SlaPair { responseHours: number; resolveHours: number }
type SlaMatrix = Partial<Record<Priority, SlaPair>>;

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  defaultAssigneeId: string | null;
  departmentId: string | null;
  department: { id: string; name: string; code: string | null } | null;
  slaResponseHours: number;
  slaResolveHours: number;
  slaMatrix: SlaMatrix | null;
  autoCloseAfterDays: number;
  isActive: boolean;
  _count: { tickets: number };
}

const DEFAULT_MATRIX: Record<Priority, SlaPair> = {
  Urgent: { responseHours: 2, resolveHours: 8 },
  High: { responseHours: 4, resolveHours: 24 },
  Medium: { responseHours: 8, resolveHours: 48 },
  Low: { responseHours: 24, resolveHours: 72 },
};

const emptyForm = {
  name: "",
  slug: "",
  description: "",
  defaultAssigneeId: "",
  departmentId: "",
  slaResponseHours: 24,
  slaResolveHours: 72,
  useMatrix: false,
  matrix: { ...DEFAULT_MATRIX } as Record<Priority, SlaPair>,
  autoCloseAfterDays: 7,
  isActive: true,
};

export default function TicketCategoriesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const { data: deptsData } = useDepartments();
  const departments = deptsData?.data ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data } = useQuery({
    queryKey: ["ticket-categories"],
    queryFn: () => api.get<Category[]>("/api/v1/hrms/tickets/categories?limit=100"),
  });
  const categories = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post("/api/v1/hrms/tickets/categories", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-categories"] });
      closeForm();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/hrms/tickets/categories/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-categories"] });
      closeForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/tickets/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-categories"] }),
  });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (c: Category) => {
    setEditId(c.id);
    const merged: Record<Priority, SlaPair> = { ...DEFAULT_MATRIX };
    if (c.slaMatrix) {
      for (const p of PRIORITIES) {
        if (c.slaMatrix[p]) merged[p] = c.slaMatrix[p]!;
      }
    }
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      defaultAssigneeId: c.defaultAssigneeId ?? "",
      departmentId: c.departmentId ?? "",
      slaResponseHours: c.slaResponseHours,
      slaResolveHours: c.slaResolveHours,
      useMatrix: !!c.slaMatrix,
      matrix: merged,
      autoCloseAfterDays: c.autoCloseAfterDays,
      isActive: c.isActive,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: form.name,
      slug: form.slug,
      slaResponseHours: form.slaResponseHours,
      slaResolveHours: form.slaResolveHours,
      slaMatrix: form.useMatrix ? form.matrix : null,
      departmentId: form.departmentId || null,
      autoCloseAfterDays: form.autoCloseAfterDays,
      isActive: form.isActive,
    };
    if (form.description) body.description = form.description;
    if (form.defaultAssigneeId) body.defaultAssigneeId = form.defaultAssigneeId;

    if (editId) {
      updateMut.mutate({ id: editId, body });
    } else {
      createMut.mutate(body);
    }
  };

  const updateMatrixCell = (priority: Priority, field: keyof SlaPair, value: number) => {
    setForm((prev) => ({
      ...prev,
      matrix: { ...prev.matrix, [priority]: { ...prev.matrix[priority], [field]: value } },
    }));
  };

  const handleDelete = async (c: Category) => {
    const ok = await dialog.confirm({
      title: "Delete category?",
      description: `"${c.name}" will be removed. Tickets using this category will keep their reference.`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (ok) deleteMut.mutate(c.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Tag className="text-[#3b82f6]" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">
            Ticket Categories
          </h1>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 btn btn-primary">
          <Plus size={16} /> New Category
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="p-1">
          <EmptyState
            variant="bot"
            title="No categories yet"
            className="border border-gray-200 shadow-sm"
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Slug</th>
                <th className="text-left px-4 py-3 font-medium">Department</th>
                <th className="text-left px-4 py-3 font-medium">Response SLA</th>
                <th className="text-left px-4 py-3 font-medium">Resolve SLA</th>
                <th className="text-left px-4 py-3 font-medium">Auto-close</th>
                <th className="text-left px-4 py-3 font-medium">Tickets</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr
                  key={c.id}
                  className={clsx(
                    "row-stagger border-t border-gray-100",
                    !c.isActive && "opacity-60"
                  )}
                  style={{ ["--i" as never]: Math.min(i, 10) }}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    {c.description && (
                      <div className="text-xs text-gray-500 mt-0.5">{c.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {c.slug}
                  </td>
                  <td className="px-4 py-3">
                    {c.department ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                        <Building2 size={10} /> {c.department.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.slaResponseHours}h
                    {c.slaMatrix && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 rounded">
                        <Zap size={9} /> by priority
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.slaResolveHours}h</td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.autoCloseAfterDays > 0 ? `${c.autoCloseAfterDays}d` : (
                      <span className="text-gray-400">disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c._count.tickets}</td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        c.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editId ? "Edit Category" : "New Category"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                pattern="[a-z0-9-]+"
                value={form.slug}
                onChange={(e) =>
                  setForm({ ...form, slug: e.target.value.toLowerCase() })
                }
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="hr, it, payroll..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department <span className="text-gray-400 font-normal">(scopes ticket routing)</span>
            </label>
            <select
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value, defaultAssigneeId: "" })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— No department (all employees can be assigned) —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ""}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">When set, only employees from this department can be assigned to tickets in this category.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Assignee
            </label>
            <EmployeeSelect
              key={form.departmentId || "all"}
              value={form.defaultAssigneeId}
              onChange={(id) => setForm({ ...form, defaultAssigneeId: id })}
              placeholder="Select default agent..."
              departmentId={form.departmentId || undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Response SLA (hours)
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.slaResponseHours}
                onChange={(e) =>
                  setForm({ ...form, slaResponseHours: parseInt(e.target.value, 10) })
                }
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Resolve SLA (hours)
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.slaResolveHours}
                onChange={(e) =>
                  setForm({ ...form, slaResolveHours: parseInt(e.target.value, 10) })
                }
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">Used when priority matrix is off, or as fallback for missing priority rows.</p>

          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/40">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={form.useMatrix}
                onChange={(e) => setForm({ ...form, useMatrix: e.target.checked })}
              />
              <Zap size={14} className="text-amber-500" />
              Priority-based SLA matrix
            </label>
            {form.useMatrix ? (
              <>
                <div className="grid grid-cols-[100px_1fr_1fr] gap-2 items-center text-[11px] font-semibold uppercase text-gray-500 mb-1 px-1">
                  <span>Priority</span>
                  <span>Response (h)</span>
                  <span>Resolve (h)</span>
                </div>
                <div className="space-y-1.5">
                  {PRIORITIES.map((p) => {
                    const tone =
                      p === "Urgent" ? "bg-red-50 text-red-700 border-red-200" :
                      p === "High" ? "bg-orange-50 text-orange-700 border-orange-200" :
                      p === "Medium" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      "bg-gray-50 text-gray-700 border-gray-200";
                    return (
                      <div key={p} className="grid grid-cols-[100px_1fr_1fr] gap-2 items-center">
                        <span className={clsx("px-2 py-1 rounded text-xs font-semibold border text-center", tone)}>{p}</span>
                        <input
                          type="number"
                          min={1}
                          value={form.matrix[p].responseHours}
                          onChange={(e) => updateMatrixCell(p, "responseHours", parseInt(e.target.value, 10) || 1)}
                          className="w-full border border-[var(--border)] rounded px-2 py-1 text-sm"
                        />
                        <input
                          type="number"
                          min={1}
                          value={form.matrix[p].resolveHours}
                          onChange={(e) => updateMatrixCell(p, "resolveHours", parseInt(e.target.value, 10) || 1)}
                          className="w-full border border-[var(--border)] rounded px-2 py-1 text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">All priorities use the default SLA above. Enable to set tighter windows for urgent tickets.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Auto-close after (days in Resolved)
            </label>
            <input
              type="number"
              min={0}
              max={365}
              required
              value={form.autoCloseAfterDays}
              onChange={(e) =>
                setForm({ ...form, autoCloseAfterDays: parseInt(e.target.value, 10) })
              }
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Set to 0 to disable auto-close. Resolved tickets older than this auto-close to Closed.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMut.isPending || updateMut.isPending}
              className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50"
            >
              {editId ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
