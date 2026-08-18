"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useRoles } from "@/lib/hooks/use-ref-data";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { useDialog } from "@/components/hrms/dialog";
import { Plus, GitBranch, Trash2, X, Pencil, ArrowRight, User, Shield, Settings as SettingsIcon, ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";

type ApprovalModule =
  | "Leave" | "Expense" | "Asset" | "Onboarding" | "Offboarding"
  | "Attendance" | "Document" | "Engagement" | "Feedback"
  | "Reimbursement" | "ProofOfInvestment" | "SalaryRevision" | "OneTimeEarning" | "Requisition"
  | "WFH" | "Payroll";
type ApproverKind = "ROLE" | "USER";

interface Level {
  level: number;
  kind: ApproverKind;
  roleId?: string;
  userId?: string;
  // Legacy field — old chains may still have this. Read-only here.
  approverType?: string;
  approverId?: string;
  escalateAfterHours?: number;
  allowSkip?: boolean;
}

interface Chain {
  id: string;
  name: string;
  module: ApprovalModule;
  levels: Level[];
  autoApproveAfterDays: number | null;
  isActive: boolean;
}

interface EmployeeRef {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
}

// Modules whose approval is driven by a central chain. Leave + Requisition use
// the strict chain engine; Engagement + Feedback use content-moderation.
// Expense, WFH, Offboarding (resignation) and Payroll consume their active
// chain when one exists, falling back to their legacy per-module behaviour
// otherwise (so an org that hasn't configured a chain keeps working).
const MODULES: ApprovalModule[] = [
  "Leave", "Requisition", "Engagement", "Feedback",
  "Expense", "WFH", "Offboarding", "Payroll",
];

const MODULE_ICON: Record<ApprovalModule, string> = {
  Leave: "🌴", Expense: "💰", Asset: "💻", Onboarding: "👋", Offboarding: "👋",
  Attendance: "🕐", Document: "📄", Engagement: "🎉", Feedback: "💬",
  Reimbursement: "🧾", ProofOfInvestment: "🛡️", SalaryRevision: "📈", OneTimeEarning: "🎁",
  Requisition: "📋", WFH: "🏠", Payroll: "💵",
};

// Human-readable labels for the Select / display.
const MODULE_LABEL: Record<ApprovalModule, string> = {
  Leave: "Leave",
  Expense: "Expense",
  Asset: "Asset",
  Onboarding: "Onboarding",
  Offboarding: "Offboarding",
  Attendance: "Attendance",
  Document: "Document",
  Engagement: "Engagement",
  Feedback: "Feedback",
  Reimbursement: "Reimbursement",
  ProofOfInvestment: "Proof of Investment",
  SalaryRevision: "Salary Revision",
  OneTimeEarning: "One-Time Earning / Deduction",
  Requisition: "Requisition",
  WFH: "Work From Home",
  Payroll: "Payroll",
};

interface FormState {
  name: string;
  module: ApprovalModule;
  levels: Level[];
  autoApproveAfterDays: number | null;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  module: "Leave",
  levels: [{ level: 1, kind: "ROLE" }],
  autoApproveAfterDays: null,
  isActive: true,
};

export default function ApprovalChainsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [advancedIdx, setAdvancedIdx] = useState<Set<number>>(new Set());

  const { data: rolesResp } = useRoles();
  const roles = rolesResp?.data ?? [];
  const roleById = new Map(roles.map((r) => [r.id, r]));

  const { data: empResp } = useQuery({
    queryKey: ["approval-chains", "employees"],
    queryFn: () => api.get<EmployeeRef[]>("/api/v1/hrms/employees?limit=500&status=Active&picker=1"),
  });
  const employees = empResp?.data ?? [];
  const empById = new Map(employees.map((e) => [e.id, e]));

  const { data, isLoading } = useQuery({
    queryKey: ["approval-chains", moduleFilter],
    queryFn: () =>
      api.get<Chain[]>(
        `/api/v1/hrms/settings/approval-chains?limit=100${moduleFilter ? `&module=${moduleFilter}` : ""}`,
      ),
  });

  const saveMut = useMutation({
    mutationFn: (body: FormState) =>
      editingId
        ? api.put(`/api/v1/hrms/settings/approval-chains/${editingId}`, body)
        : api.post("/api/v1/hrms/settings/approval-chains", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-chains"] });
      setShowModal(false);
      setEditingId(null);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/api/v1/hrms/settings/approval-chains/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-chains"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/settings/approval-chains/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-chains"] }),
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setAdvancedIdx(new Set());
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (c: Chain) => {
    // Convert any legacy levels to new shape (best-effort) so editing works.
    const normalized: Level[] = c.levels.map((l, i) => {
      if (l.kind === "ROLE" || l.kind === "USER") return { ...l, level: i + 1 };
      // Legacy: try to map by role name if possible, else default to USER picker.
      if (l.approverType && l.approverType !== "Custom") {
        const match = roles.find((r) => r.name.toLowerCase() === String(l.approverType).toLowerCase());
        if (match) return { level: i + 1, kind: "ROLE", roleId: match.id };
      }
      return { level: i + 1, kind: l.approverId ? "USER" : "ROLE", userId: l.approverId };
    });
    setForm({
      name: c.name,
      module: c.module,
      levels: normalized,
      autoApproveAfterDays: c.autoApproveAfterDays,
      isActive: c.isActive,
    });
    setAdvancedIdx(new Set());
    setEditingId(c.id);
    setShowModal(true);
  };

  const addLevel = () =>
    setForm({ ...form, levels: [...form.levels, { level: form.levels.length + 1, kind: "ROLE" }] });
  const removeLevel = (idx: number) =>
    setForm({
      ...form,
      levels: form.levels.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 })),
    });
  const updateLevel = (idx: number, patch: Partial<Level>) =>
    setForm({ ...form, levels: form.levels.map((l, i) => (i === idx ? { ...l, ...patch } : l)) });
  const toggleAdv = (idx: number) => {
    const next = new Set(advancedIdx);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setAdvancedIdx(next);
  };

  const renderApproverLabel = (l: Level): string => {
    if (l.kind === "USER") {
      const e = l.userId ? empById.get(l.userId) : null;
      return e ? `${e.firstName} ${e.lastName}` : "Unknown user";
    }
    if (l.kind === "ROLE") {
      const r = l.roleId ? roleById.get(l.roleId) : null;
      return r ? r.name : "Unknown role";
    }
    // Legacy data — show raw label
    return l.approverType ?? "Unknown";
  };

  const chains = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(chains.length / PAGE_SIZE));
  const pageItems = chains.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const validForm = form.levels.every((l) => (l.kind === "ROLE" ? !!l.roleId : !!l.userId));

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white shadow-sm">
            <GitBranch size={18} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Approval Chains</h1>
            <p className="text-xs text-gray-500 mt-0.5">Define who approves what — pick roles or specific people per step.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={moduleFilter}
            onChange={(v) => { setModuleFilter(v); setPage(1); }}
            placeholder="All modules"
            options={[{ value: "", label: "All modules" }, ...MODULES.map((m) => ({ value: m, label: `${MODULE_ICON[m]}  ${m}` }))]}
            className="w-44"
          />
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-b from-green-500 to-green-600 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
          >
            <Plus size={13} /> New chain
          </button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonCards count={4} />
      ) : chains.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <GitBranch size={36} className="mx-auto mb-3 text-gray-300" />
          <h3 className="text-[13px] font-semibold text-gray-700 mb-1">No approval chains yet</h3>
          <p className="text-xs text-gray-500 mb-4">Create one to route requests through approvers automatically.</p>
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
            <Plus size={13} /> Create your first chain
          </button>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pageItems.map((c) => (
            <div
              key={c.id}
              className={clsx(
                "bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition",
                !c.isActive && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{MODULE_ICON[c.module]}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-[13px]">{c.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-semibold">{MODULE_LABEL[c.module] ?? c.module}</span>
                      <span className={clsx("text-[11px] px-2 py-0.5 rounded-full font-semibold", c.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                      {c.autoApproveAfterDays && (
                        <span className="text-[11px] text-gray-500">auto-approve after {c.autoApproveAfterDays}d</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(c)}
                    title="Edit"
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => toggleMut.mutate({ id: c.id, isActive: !c.isActive })}
                    className="px-2.5 py-1 text-xs font-normal text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition"
                  >
                    {c.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Delete approval chain?",
                        description: `"${c.name}" will be permanently removed.`,
                        variant: "danger",
                        confirmLabel: "Delete",
                      });
                      if (ok) deleteMut.mutate(c.id);
                    }}
                    title="Delete"
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Visual flow */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-[11px] font-medium text-gray-600">
                  <User size={11} /> Requester
                </div>
                {c.levels.map((l) => {
                  const isUser = l.kind === "USER";
                  return (
                    <div key={l.level} className="flex items-center gap-1.5">
                      <ArrowRight size={12} className="text-gray-300" />
                      <div className={clsx(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 border rounded text-[11px] font-medium",
                        isUser
                          ? "bg-purple-50 text-purple-700 border-purple-200"
                          : "bg-green-50 text-green-700 border-green-200",
                      )}>
                        <span className="opacity-60">L{l.level}</span>
                        {isUser ? <User size={10} /> : <Shield size={10} />}
                        <span>{renderApproverLabel(l)}</span>
                        {l.escalateAfterHours && <span className="text-[10px] opacity-70">⏱{l.escalateAfterHours}h</span>}
                      </div>
                    </div>
                  );
                })}
                <ArrowRight size={12} className="text-gray-300" />
                <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded text-[11px] font-medium">
                  ✓ Approved
                </div>
              </div>
            </div>
          ))}
        </div>
        <Pagination page={page} totalPages={totalPages} total={chains.length} limit={PAGE_SIZE} onPageChange={setPage} className="border-t-0 px-0" />
        </>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingId(null);
        }}
        title={editingId ? "Edit approval chain" : "New approval chain"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!validForm) return;
            saveMut.mutate(form);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Name</label>
              <input
                required
                placeholder="e.g. Leave — Standard"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Applies to</label>
              <Select
                value={form.module}
                onChange={(v) => setForm({ ...form, module: v as ApprovalModule })}
                options={MODULES.map((m) => ({ value: m, label: `${MODULE_ICON[m]}  ${MODULE_LABEL[m]}` }))}
              />
            </div>
          </div>

          {/* Approval steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">Approval steps</label>
              <button
                type="button"
                onClick={addLevel}
                className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700"
              >
                <Plus size={12} /> Add step
              </button>
            </div>

            <div className="space-y-2">
              {form.levels.map((l, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/40">
                  <div className="flex items-center gap-2 p-2.5">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-[11px] font-medium flex-shrink-0">
                      {l.level}
                    </span>

                    {/* Kind toggle */}
                    <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-[11px] font-medium flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => updateLevel(idx, { kind: "ROLE", userId: undefined })}
                        className={clsx("px-2.5 py-1 flex items-center gap-1", l.kind === "ROLE" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}
                      >
                        <Shield size={11} /> Role
                      </button>
                      <button
                        type="button"
                        onClick={() => updateLevel(idx, { kind: "USER", roleId: undefined })}
                        className={clsx("px-2.5 py-1 flex items-center gap-1 border-l border-gray-300", l.kind === "USER" ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50")}
                      >
                        <User size={11} /> Person
                      </button>
                    </div>

                    {/* Picker */}
                    <div className="flex-1">
                      {l.kind === "ROLE" ? (
                        <Select
                          value={l.roleId ?? ""}
                          onChange={(v) => updateLevel(idx, { roleId: v })}
                          size="sm"
                          placeholder="Pick a role…"
                          options={roles.map((r) => ({ value: r.id, label: r.name }))}
                        />
                      ) : (
                        <Select
                          value={l.userId ?? ""}
                          onChange={(v) => updateLevel(idx, { userId: v })}
                          size="sm"
                          searchable
                          placeholder="Pick an employee…"
                          options={employees.map((e) => ({
                            value: e.id,
                            label: `${e.firstName} ${e.lastName} (${e.employeeCode})`,
                          }))}
                        />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleAdv(idx)}
                      title="Advanced options"
                      className={clsx(
                        "p-1.5 rounded transition flex items-center gap-1 text-[11px]",
                        advancedIdx.has(idx) ? "bg-green-100 text-green-700" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100",
                      )}
                    >
                      <SettingsIcon size={12} />
                      <ChevronDown size={10} className={clsx("transition-transform", advancedIdx.has(idx) && "rotate-180")} />
                    </button>
                    {form.levels.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLevel(idx)}
                        title="Remove step"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {advancedIdx.has(idx) && (
                    <div className="px-2.5 pb-2.5 pt-1 border-t border-gray-200 bg-white grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-600 mb-1 uppercase tracking-wide">Escalate after (hours)</label>
                        <NumberInput
                          allowDecimal={false}
                          placeholder="e.g. 48"
                          value={l.escalateAfterHours ?? null}
                          onChange={(v) => updateLevel(idx, { escalateAfterHours: v ?? undefined })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <label className="flex items-center gap-2 self-end pb-1 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={l.allowSkip ?? false}
                          onChange={(e) => updateLevel(idx, { allowSkip: e.target.checked })}
                          className="w-3.5 h-3.5 accent-green-600"
                        />
                        Allow skip if approver absent
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!validForm && (
              <p className="mt-2 text-[11px] text-red-600">Each step needs a role or employee selected.</p>
            )}
          </div>

          {/* Footer settings */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Auto-approve after</label>
              <div className="flex items-center gap-2">
                <NumberInput
                  allowDecimal={false}
                  placeholder="Optional"
                  value={form.autoApproveAfterDays ?? null}
                  onChange={(v) => setForm({ ...form, autoApproveAfterDays: v })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs"
                />
                <span className="text-xs text-gray-500 flex-shrink-0">days</span>
              </div>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 accent-green-600"
              />
              Activate immediately
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setShowModal(false);
                setEditingId(null);
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMut.isPending || !validForm}
              className="px-3 py-1.5 bg-gradient-to-b from-green-500 to-green-600 text-white rounded-lg text-xs font-medium hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveMut.isPending ? "Saving..." : editingId ? "Save changes" : "Create chain"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
