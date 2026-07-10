"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { EmptyState } from "@/components/hrms/empty-state";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import {
  Layers, Plus, Trash2, Users, Shield, Tag, UserCircle, Pencil, Check, X, Search,
  Info, CalendarDays, Hash, SlidersHorizontal, Settings2,
} from "lucide-react";
import { clsx } from "clsx";

// Shared input styling for the Leave Type modal (matches the sectioned redesign).
const PLAIN_INPUT = "w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";
const ICON_INPUT = "w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";

/** Card-style grouping with an icon + title header for the Leave Type modal. */
function FormSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
        <span className="text-green-600">{icon}</span>
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-4 py-3 space-y-3">{children}</div>
    </div>
  );
}

/** Labelled field wrapper. */
function Field({ label, required, small, children }: { label: string; required?: boolean; small?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={clsx("block font-medium text-gray-600 mb-1", small ? "text-xs" : "text-xs")}>
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

interface LeaveTypeItem {
  id: string;
  name: string;
  code: string;
  color: string | null;
  isPaid: boolean;
  accrualType: string;
  accrualCount: string;
  maxBalance: number;
  applicableAfterDays: number;
  applicableGender: string | null;
  minConsecutiveDays: number | null;
  maxConsecutiveDays: number | null;
  maxPerMonth: number | null;
  maxPerYear: number | null;
  isOnceInLifetime: boolean;
  isCarryForward: boolean;
  maxCarryForward: number | null;
  isHalfDayAllowed: boolean;
  isEncashable: boolean;
  maxEncashment: number | null;
  requiresDocumentation: boolean;
  documentationAfterDays: number | null;
  includesHolidays: boolean;
  includesWeekoffs: boolean;
  isNegativeBalanceAllowed: boolean;
  maxNegativeBalance: number | null;
  isHourlyAllowed: boolean;
  isCompOff: boolean;
  compOffExpiryDays: number | null;
  isDefault: boolean;
  applicableEmploymentType: string[] | null;
}

const EMPLOYMENT_TYPES = ["FullTime", "PartTime", "Contract", "Intern", "Freelancer", "Consultant"];

interface LeaveGroupAssignment {
  id: string;
  assigneeType: "Employee" | "Role";
  employeeId: string | null;
  roleId: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string; jobTitle: string | null; profilePhoto: string | null } | null;
  role?: { id: string; name: string; code: string } | null;
}

interface LeaveGroupItem {
  id: string;
  leaveTypeId: string;
  overrideQuota: string | null;
  leaveType: { id: string; name: string; code: string; color: string | null };
}

interface LeaveGroup {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  items: LeaveGroupItem[];
  assignments: LeaveGroupAssignment[];
  _count?: { items: number; assignments: number };
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  jobTitle: string | null;
  profilePhoto: string | null;
}

interface Role {
  id: string;
  name: string;
  code: string;
}

export default function LeavePoliciesPage() {
  const [tab, setTab] = useState<"types" | "groups">("types");
  const { hasPermission, isLoading: permsLoading } = useDashboardConfig();
  // Managing leave types & groups requires hrms.leave.manage (also enforced by
  // the API). Employees / self-service roles get a read-blocked state instead
  // of the management UI.
  const canManage = hasPermission("hrms.leave.manage");

  if (!permsLoading && !canManage) {
    return (
      <EmptyState
        variant="folder"
        title="You don't have access to Leave Policies"
        description="Managing leave types and leave groups is restricted to HR administrators. Contact your administrator if you need access."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="surface-card p-1 inline-flex items-center gap-1">
        <TabButton active={tab === "types"} onClick={() => setTab("types")} icon={<Tag size={14} />} label="Leave Types" />
        <TabButton active={tab === "groups"} onClick={() => setTab("groups")} icon={<Layers size={14} />} label="Leave Groups" />
      </div>
      {tab === "types" ? <LeaveTypesTab /> : <LeaveGroupsTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-semibold transition",
        active ? "bg-green-600 text-white shadow-sm" : "text-gray-600 hover:text-[#166534] hover:bg-gray-50",
      )}
    >
      {icon} {label}
    </button>
  );
}

// ─── LEAVE TYPES TAB ─────────────────────────────────────

function LeaveTypesTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; item: LeaveTypeItem | null }>({ open: false, item: null });
  const emptyForm = {
    name: "", code: "", isPaid: true,
    leaveCount: 0,
    applicableAfterDays: 0,
    applicableGender: "All",
    applicableEmploymentType: [] as string[],
    isCarryForward: false, maxCarryForward: null as number | null,
    isHalfDayAllowed: true,
    isEncashable: false, maxEncashment: null as number | null,
    requiresDocumentation: false, documentationAfterDays: null as number | null,
    minConsecutiveDays: null as number | null,
    maxConsecutiveDays: null as number | null,
    maxPerMonth: null as number | null,
    isOnceInLifetime: false,
    isNegativeBalanceAllowed: false, maxNegativeBalance: null as number | null,
    includesHolidays: false,
    includesWeekoffs: false,
    isHourlyAllowed: false,
    isCompOff: false, compOffExpiryDays: null as number | null,
    isDefault: false,
  };
  const [form, setForm] = useState(emptyForm);

  // Server still tracks accrual semantics; we hide them from the UI and always
  // treat the leave as Yearly (entire leaveCount credited once a year). The
  // body maps the single "Leave Count" field to BOTH accrualCount and
  // maxBalance so existing accrual / balance logic keeps working.
  const buildBody = (f: typeof form) => ({
    name: f.name,
    code: f.code,
    isPaid: f.isPaid,
    accrualType: "Yearly",
    accrualCount: f.leaveCount,
    maxBalance: f.leaveCount,
    applicableAfterDays: f.applicableAfterDays,
    applicableGender: f.applicableGender === "All" ? undefined : f.applicableGender,
    applicableEmploymentType: f.applicableEmploymentType.length ? f.applicableEmploymentType : undefined,
    isCarryForward: f.isCarryForward,
    maxCarryForward: f.isCarryForward ? (f.maxCarryForward ?? undefined) : undefined,
    isHalfDayAllowed: f.isHalfDayAllowed,
    isEncashable: f.isEncashable,
    maxEncashment: f.isEncashable ? (f.maxEncashment ?? undefined) : undefined,
    requiresDocumentation: f.requiresDocumentation,
    documentationAfterDays: f.requiresDocumentation ? (f.documentationAfterDays ?? undefined) : undefined,
    minConsecutiveDays: f.minConsecutiveDays ?? undefined,
    maxConsecutiveDays: f.maxConsecutiveDays ?? undefined,
    maxPerMonth: f.maxPerMonth ?? undefined,
    isOnceInLifetime: f.isOnceInLifetime,
    isNegativeBalanceAllowed: f.isNegativeBalanceAllowed,
    maxNegativeBalance: f.isNegativeBalanceAllowed ? (f.maxNegativeBalance ?? undefined) : undefined,
    includesHolidays: f.includesHolidays,
    includesWeekoffs: f.includesWeekoffs,
    isHourlyAllowed: f.isHourlyAllowed,
    isCompOff: f.isCompOff,
    compOffExpiryDays: f.isCompOff ? (f.compOffExpiryDays ?? undefined) : undefined,
    isDefault: f.isDefault,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["leave-types"],
    queryFn: () => api.get<LeaveTypeItem[]>("/api/v1/hrms/leaves/types?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/leaves/types", buildBody(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-types"] }); setModal({ open: false, item: null }); toast.success("Leave type created"); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) => api.patch(`/api/v1/hrms/leaves/types/${id}`, buildBody(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-types"] }); setModal({ open: false, item: null }); toast.success("Leave type updated"); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/leaves/types/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-types"] }); toast.success("Leave type deleted"); },
  });

  const columns: Column<LeaveTypeItem>[] = [
    { key: "name", label: "Name", render: (t) => <span>{t.name}</span> },
    { key: "code", label: "Code" },
    { key: "isPaid", label: "Paid", render: (t) => t.isPaid ? "Yes" : "No" },
    { key: "maxBalance", label: "Leave Count", render: (t) => `${t.maxBalance}` },
    { key: "isCarryForward", label: "Carry Fwd", render: (t) => t.isCarryForward ? "Yes" : "No" },
  ];

  const openAdd = () => {
    setForm(emptyForm);
    setModal({ open: true, item: null });
  };

  const openEdit = (item: LeaveTypeItem) => {
    setForm({
      name: item.name, code: item.code, isPaid: item.isPaid,
      leaveCount: item.maxBalance,
      applicableAfterDays: item.applicableAfterDays ?? 0,
      applicableGender: item.applicableGender ?? "All",
      applicableEmploymentType: item.applicableEmploymentType ?? [],
      isCarryForward: item.isCarryForward,
      maxCarryForward: item.maxCarryForward ?? null,
      isHalfDayAllowed: item.isHalfDayAllowed,
      isEncashable: item.isEncashable,
      maxEncashment: item.maxEncashment ?? null,
      requiresDocumentation: item.requiresDocumentation ?? false,
      documentationAfterDays: item.documentationAfterDays ?? null,
      minConsecutiveDays: item.minConsecutiveDays ?? null,
      maxConsecutiveDays: item.maxConsecutiveDays ?? null,
      maxPerMonth: item.maxPerMonth ?? null,
      isOnceInLifetime: item.isOnceInLifetime ?? false,
      isNegativeBalanceAllowed: item.isNegativeBalanceAllowed ?? false,
      maxNegativeBalance: item.maxNegativeBalance ?? null,
      includesHolidays: item.includesHolidays ?? false,
      includesWeekoffs: item.includesWeekoffs ?? false,
      isHourlyAllowed: item.isHourlyAllowed ?? false,
      isCompOff: item.isCompOff ?? false,
      compOffExpiryDays: item.compOffExpiryDays ?? null,
      isDefault: item.isDefault ?? false,
    });
    setModal({ open: true, item });
  };

  const filtered = (data?.data ?? []).filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <CrudTable
        title="Leave Types"
        data={filtered}
        columns={columns}
        isLoading={isLoading}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(id) => deleteMut.mutate(id)}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search leave types..."
      />

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, item: null })}
        title={modal.item ? "Edit Leave Type" : "Add Leave Type"}
        subtitle="Define leave policy and rules for this leave type"
        headerIcon={<CalendarDays size={18} />}
        size="xl"
        bodyClassName="p-4 bg-gray-50 overflow-y-auto"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); modal.item ? updateMut.mutate({ id: modal.item.id, body: form }) : createMut.mutate(form); }}
          className="space-y-3"
        >
          {/* ── Basic Information ── */}
          <FormSection icon={<Info size={14} />} title="Basic Information">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" required>
                <div className="relative">
                  <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                    placeholder="e.g. Casual Leave" className={ICON_INPUT} />
                </div>
              </Field>
              <Field label="Code" required>
                <div className="relative">
                  <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required
                    placeholder="e.g. CL" className={ICON_INPUT} />
                </div>
              </Field>
            </div>
          </FormSection>

          {/* ── Leave Configuration ── */}
          <FormSection icon={<SlidersHorizontal size={14} />} title="Leave Configuration">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Leave Count (Days)" required>
                <NumberInput allowDecimal={false} min={0} value={form.leaveCount}
                  onChange={(v) => setForm({ ...form, leaveCount: v ?? 0 })} className={PLAIN_INPUT} />
              </Field>
              <Field label="Eligible After (Days)" required>
                <NumberInput allowDecimal={false} min={0} value={form.applicableAfterDays}
                  onChange={(v) => setForm({ ...form, applicableAfterDays: v ?? 0 })} className={PLAIN_INPUT} />
              </Field>
              <Field label="Applicable To" required>
                <Select
                  value={form.applicableGender}
                  onChange={(v) => setForm({ ...form, applicableGender: v })}
                  options={[
                    { value: "All",    label: "All employees" },
                    { value: "Female", label: "Female only", description: "e.g. Maternity" },
                    { value: "Male",   label: "Male only",   description: "e.g. Paternity" },
                    { value: "Other",  label: "Other" },
                  ]}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Min Consecutive (Days)">
                <NumberInput allowDecimal={false} min={0} value={form.minConsecutiveDays} placeholder="Optional"
                  onChange={(v) => setForm({ ...form, minConsecutiveDays: v })} className={PLAIN_INPUT} />
              </Field>
              <Field label="Max Consecutive (Days)">
                <NumberInput allowDecimal={false} min={0} value={form.maxConsecutiveDays} placeholder="Optional"
                  onChange={(v) => setForm({ ...form, maxConsecutiveDays: v })} className={PLAIN_INPUT} />
              </Field>
              <Field label="Max per Month (Requests)">
                <NumberInput allowDecimal={false} min={0} value={form.maxPerMonth} placeholder="Unlimited"
                  onChange={(v) => setForm({ ...form, maxPerMonth: v })} className={PLAIN_INPUT} />
              </Field>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Applicable Employment Types
                <span className="ml-1 font-normal text-gray-400">— select types this leave is applicable to</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {EMPLOYMENT_TYPES.map((t) => {
                  const on = form.applicableEmploymentType.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          applicableEmploymentType: on
                            ? form.applicableEmploymentType.filter((x) => x !== t)
                            : [...form.applicableEmploymentType, t],
                        })
                      }
                      className={clsx(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
                        on
                          ? "border-green-500 bg-green-50 text-green-700"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
                      )}
                    >
                      {on && <Check size={12} />}
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </FormSection>

          {/* ── Rules & Settings ── */}
          <FormSection icon={<Settings2 size={14} />} title="Rules & Settings">
            <p className="text-[11px] text-gray-500 -mt-1">Configure additional rules available for this leave type.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
              {[
                { key: "isPaid" as const,             label: "Paid" },
                { key: "isHalfDayAllowed" as const,   label: "Half Day" },
                { key: "isHourlyAllowed" as const,    label: "Hourly Allowed" },
                { key: "isCarryForward" as const,     label: "Carry Forward" },
                { key: "isEncashable" as const,       label: "Encashable" },
                { key: "requiresDocumentation" as const, label: "Requires Documentation" },
                { key: "includesHolidays" as const,   label: "Includes Holidays" },
                { key: "includesWeekoffs" as const,   label: "Includes Week-offs" },
                { key: "isNegativeBalanceAllowed" as const, label: "Allow Negative Balance" },
                { key: "isCompOff" as const,          label: "Comp Off" },
                { key: "isOnceInLifetime" as const,   label: "Once in a lifetime (e.g. Marriage)" },
                { key: "isDefault" as const,          label: "Set as Default" },
              ].map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form[opt.key]} onChange={(e) => setForm({ ...form, [opt.key]: e.target.checked })}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                  {opt.label}
                </label>
              ))}
            </div>

            {(form.isCarryForward || form.isEncashable || form.requiresDocumentation || form.isNegativeBalanceAllowed || form.isCompOff) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white border border-gray-200 rounded-lg p-3 mt-1">
                {form.isCarryForward && (
                  <Field label="Max Carry Forward" small>
                    <NumberInput allowDecimal={false} min={0} value={form.maxCarryForward} placeholder="days"
                      onChange={(v) => setForm({ ...form, maxCarryForward: v })} className={PLAIN_INPUT} />
                  </Field>
                )}
                {form.isEncashable && (
                  <Field label="Max Encashment" small>
                    <NumberInput allowDecimal={false} min={0} value={form.maxEncashment} placeholder="days"
                      onChange={(v) => setForm({ ...form, maxEncashment: v })} className={PLAIN_INPUT} />
                  </Field>
                )}
                {form.requiresDocumentation && (
                  <Field label="Docs After (days)" small>
                    <NumberInput allowDecimal={false} min={0} value={form.documentationAfterDays} placeholder="e.g. 3"
                      onChange={(v) => setForm({ ...form, documentationAfterDays: v })} className={PLAIN_INPUT} />
                  </Field>
                )}
                {form.isNegativeBalanceAllowed && (
                  <Field label="Max Negative Balance" small>
                    <NumberInput allowDecimal={false} min={0} value={form.maxNegativeBalance} placeholder="days"
                      onChange={(v) => setForm({ ...form, maxNegativeBalance: v })} className={PLAIN_INPUT} />
                  </Field>
                )}
                {form.isCompOff && (
                  <Field label="Comp-Off Expiry (days)" small>
                    <NumberInput allowDecimal={false} min={0} value={form.compOffExpiryDays} placeholder="e.g. 90"
                      onChange={(v) => setForm({ ...form, compOffExpiryDays: v })} className={PLAIN_INPUT} />
                  </Field>
                )}
              </div>
            )}
          </FormSection>

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Info size={12} className="text-green-500 shrink-0" />
              Balance accrues <strong>yearly</strong> — leave count is credited on the yearly reset.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setModal({ open: false, item: null })}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                {modal.item
                  ? (updateMut.isPending ? "Updating…" : "Update Leave Type")
                  : (createMut.isPending ? "Creating…" : "Create Leave Type")}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ─── LEAVE GROUPS TAB ────────────────────────────────────

function LeaveGroupsTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm } = useDialog();
  const [groupModal, setGroupModal] = useState<{ open: boolean; group: LeaveGroup | null }>({ open: false, group: null });
  const [assignModal, setAssignModal] = useState<{ open: boolean; group: LeaveGroup | null }>({ open: false, group: null });

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ["leave-groups"],
    queryFn: () => api.get<LeaveGroup[]>("/api/v1/hrms/leaves/groups"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/leaves/groups/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-groups"] }); toast.success("Leave group deleted"); },
  });

  const handleDelete = async (group: LeaveGroup) => {
    const ok = await confirm({
      title: "Delete leave group?",
      description: `"${group.name}" will be removed. This cannot be undone.`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (ok) deleteMut.mutate(group.id);
  };

  const groups = groupsData?.data ?? [];

  return (
    <>
      <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[13px] font-semibold text-gray-900">Leave Groups</h2>
            <p className="text-xs text-gray-500">Bundle leave types and assign to employees or roles.</p>
          </div>
          <button
            onClick={() => setGroupModal({ open: true, group: null })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm"
          >
            <Plus size={13} /> New Group
          </button>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-xs text-gray-500">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="py-12 text-center">
            <Layers size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-xs text-gray-500">No leave groups yet.</p>
            <p className="text-xs text-gray-400">Create one to bundle leave types and assign to individuals or roles.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onEdit={() => setGroupModal({ open: true, group: g })}
                onAssign={() => setAssignModal({ open: true, group: g })}
                onDelete={() => handleDelete(g)}
              />
            ))}
          </div>
        )}
      </div>

      {groupModal.open && (
        <LeaveGroupEditor
          group={groupModal.group}
          onClose={() => setGroupModal({ open: false, group: null })}
        />
      )}

      {assignModal.open && assignModal.group && (
        <AssignmentEditor
          group={assignModal.group}
          onClose={() => setAssignModal({ open: false, group: null })}
        />
      )}
    </>
  );
}

function GroupCard({ group, onEdit, onAssign, onDelete }: {
  group: LeaveGroup; onEdit: () => void; onAssign: () => void; onDelete: () => void;
}) {
  const empCount = group.assignments.filter((a) => a.assigneeType === "Employee").length;
  const roleCount = group.assignments.filter((a) => a.assigneeType === "Role").length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white hover:shadow-md transition p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-gray-900 truncate">{group.name}</h3>
          {group.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{group.description}</p>}
        </div>
        <span className={clsx(
          "text-[11px] font-medium px-1.5 py-0.5 rounded",
          group.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
        )}>
          {group.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mt-2 mb-3 min-h-[22px]">
        {group.items.slice(0, 5).map((it) => (
          <span
            key={it.id}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5"
            style={it.leaveType.color ? { borderLeftWidth: 3, borderLeftColor: it.leaveType.color } : {}}
          >
            {it.leaveType.code}
          </span>
        ))}
        {group.items.length > 5 && (
          <span className="text-[11px] text-gray-500 px-1.5 py-0.5">+{group.items.length - 5}</span>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600 border-t border-gray-100 pt-2.5">
        <div className="inline-flex items-center gap-1"><Users size={12} /> {empCount} employee{empCount === 1 ? "" : "s"}</div>
        <div className="inline-flex items-center gap-1"><Shield size={12} /> {roleCount} role{roleCount === 1 ? "" : "s"}</div>
      </div>

      <div className="flex items-center gap-1 mt-3">
        <button onClick={onAssign} className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-[#f0fdf4] hover:bg-[#dcfce7] text-[#16a34a] rounded text-xs font-normal">
          <Users size={12} /> Assign
        </button>
        <button onClick={onEdit} className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded text-xs font-normal">
          <Pencil size={12} /> Edit
        </button>
        <button onClick={onDelete} className="inline-flex items-center gap-1 px-2.5 py-1 border border-red-200 hover:bg-red-50 text-red-600 rounded text-xs font-normal">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── GROUP EDITOR ────────────────────────────────────────

function LeaveGroupEditor({ group, onClose }: { group: LeaveGroup | null; onClose: () => void }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: typesData } = useQuery({
    queryKey: ["leave-types", "for-group"],
    queryFn: () => api.get<LeaveTypeItem[]>("/api/v1/hrms/leaves/types?limit=100"),
  });

  const [form, setForm] = useState({
    name: group?.name ?? "",
    description: group?.description ?? "",
    isActive: group?.isActive ?? true,
    items: (group?.items ?? []).map((i) => ({
      leaveTypeId: i.leaveTypeId,
      overrideQuota: i.overrideQuota ? Number(i.overrideQuota) : null as number | null,
    })),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/leaves/groups", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-groups"] }); toast.success("Leave group created"); onClose(); },
  });

  const updateMut = useMutation({
    mutationFn: (body: typeof form) => api.patch(`/api/v1/hrms/leaves/groups/${group!.id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-groups"] }); toast.success("Leave group updated"); onClose(); },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Group name required");
    if (form.items.length === 0) return toast.error("Select at least one leave type");
    group ? updateMut.mutate(form) : createMut.mutate(form);
  };

  const allTypes = typesData?.data ?? [];
  const selectedIds = new Set(form.items.map((i) => i.leaveTypeId));

  const toggleType = (id: string) => {
    setForm((p) => selectedIds.has(id)
      ? { ...p, items: p.items.filter((i) => i.leaveTypeId !== id) }
      : { ...p, items: [...p.items, { leaveTypeId: id, overrideQuota: null }] }
    );
  };

  const updateQuota = (id: string, q: number | null) => {
    setForm((p) => ({
      ...p,
      items: p.items.map((i) => i.leaveTypeId === id ? { ...i, overrideQuota: q } : i),
    }));
  };

  return (
    <Modal open onClose={onClose} title={group ? "Edit Leave Group" : "New Leave Group"} size="xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Group Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g., Full-Time Standard, Intern Plan"
              className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <Select
              value={form.isActive ? "active" : "inactive"}
              onChange={(v) => setForm({ ...form, isActive: v === "active" })}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            placeholder="Who this group is for, special conditions, etc."
            className="w-full border border-[var(--border)] rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700">Leave Types in this Group *</label>
            <span className="text-[11px] text-gray-500">{form.items.length} selected</span>
          </div>
          {allTypes.length === 0 ? (
            <div className="p-4 rounded-md border border-dashed border-gray-300 text-center text-xs text-gray-500">
              No leave types yet. Create some in the Leave Types tab first.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto p-1">
              {allTypes.map((t) => {
                const selected = selectedIds.has(t.id);
                const item = form.items.find((i) => i.leaveTypeId === t.id);
                return (
                  <div
                    key={t.id}
                    className={clsx(
                      "flex items-center gap-2 rounded-md border px-2 py-1.5 transition",
                      selected ? "border-[#22c55e] bg-[#f0fdf4]" : "border-gray-200 bg-white"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleType(t.id)}
                      className={clsx(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                        selected ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-gray-300"
                      )}
                    >
                      {selected && <Check size={11} />}
                    </button>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 ring-1 ring-inset ring-black/10" style={{ backgroundColor: t.color || "#cbd5e1" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{t.name}</div>
                      <div className="text-[10px] text-gray-500">{t.code} · {t.maxBalance} days/yr</div>
                    </div>
                    {selected && (
                      <NumberInput
                        step={0.5}
                        placeholder="Quota"
                        value={item?.overrideQuota ?? null}
                        onChange={(v) => updateQuota(t.id, v)}
                        style={{ width: "70px" }}
                        className="shrink-0 border border-[var(--border)] rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#166534]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-gray-500 mt-1">Quota field overrides type default for members of this group. Leave empty to inherit.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            type="submit"
            disabled={createMut.isPending || updateMut.isPending}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium"
          >
            {group ? "Save Changes" : "Create Group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── ASSIGNMENT EDITOR ───────────────────────────────────

function AssignmentEditor({ group, onClose }: { group: LeaveGroup; onClose: () => void }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<"Employee" | "Role">("Employee");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: full } = useQuery({
    queryKey: ["leave-group", group.id],
    queryFn: () => api.get<LeaveGroup>(`/api/v1/hrms/leaves/groups/${group.id}`),
  });

  const { data: empsData } = useQuery({
    queryKey: ["employees", "for-group-assign"],
    queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=200"),
    enabled: mode === "Employee",
  });

  // An employee can only belong to ONE leave group. Map each employee already
  // in a *different* group → that group's name, so we can disable them in the
  // picker (the server also enforces this).
  const { data: allGroupsData } = useQuery({
    queryKey: ["leave-groups"],
    queryFn: () => api.get<LeaveGroup[]>("/api/v1/hrms/leaves/groups"),
    enabled: mode === "Employee",
  });
  const otherGroupByEmp = useMemo(() => {
    const m = new Map<string, string>();
    (allGroupsData?.data ?? []).forEach((g) => {
      if (g.id === group.id) return;
      g.assignments.forEach((a) => {
        if (a.assigneeType === "Employee" && a.employeeId) m.set(a.employeeId, g.name);
      });
    });
    return m;
  }, [allGroupsData, group.id]);

  const { data: rolesData } = useQuery({
    queryKey: ["roles", "for-group-assign"],
    queryFn: () => api.get<Role[]>("/api/v1/hrms/settings/roles"),
    enabled: mode === "Role",
  });

  const addMut = useMutation({
    mutationFn: (assignments: Array<{ assigneeType: "Employee" | "Role"; employeeId?: string; roleId?: string }>) =>
      api.post(`/api/v1/hrms/leaves/groups/${group.id}/assignments`, { assignments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-group", group.id] });
      qc.invalidateQueries({ queryKey: ["leave-groups"] });
      setPicked(new Set());
      toast.success("Assigned");
    },
  });

  const removeMut = useMutation({
    mutationFn: (assignmentId: string) =>
      api.delete(`/api/v1/hrms/leaves/groups/${group.id}/assignments?assignmentId=${assignmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-group", group.id] });
      qc.invalidateQueries({ queryKey: ["leave-groups"] });
      toast.success("Removed");
    },
  });

  const current = full?.data ?? group;
  const assignedEmpIds = useMemo(() => new Set(current.assignments.filter((a) => a.assigneeType === "Employee").map((a) => a.employeeId!)), [current]);
  const assignedRoleIds = useMemo(() => new Set(current.assignments.filter((a) => a.assigneeType === "Role").map((a) => a.roleId!)), [current]);

  const emps = (empsData?.data ?? []).filter((e) => {
    const full = `${e.firstName} ${e.lastName} ${e.employeeCode}`.toLowerCase();
    return !assignedEmpIds.has(e.id) && (!search || full.includes(search.toLowerCase()));
  });
  const roles = (rolesData?.data ?? []).filter((r) =>
    !assignedRoleIds.has(r.id) && (!search || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  const togglePick = (id: string) =>
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const doAssign = () => {
    if (picked.size === 0) return toast.error("Select at least one");
    const list = Array.from(picked).map((id) => mode === "Employee"
      ? { assigneeType: "Employee" as const, employeeId: id }
      : { assigneeType: "Role" as const, roleId: id }
    );
    addMut.mutate(list);
  };

  return (
    <Modal open onClose={onClose} title={`Assign — ${group.name}`} size="2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="space-y-3">
          <div className="flex items-center gap-1 border-b border-gray-200">
            <SubTab active={mode === "Employee"} onClick={() => { setMode("Employee"); setPicked(new Set()); }} icon={<UserCircle size={13} />} label="By Employee" />
            <SubTab active={mode === "Role"} onClick={() => { setMode("Role"); setPicked(new Set()); }} icon={<Shield size={13} />} label="By Role" />
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mode === "Employee" ? "Search employees…" : "Search roles…"}
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1 rounded-md border border-gray-100 p-1">
            {mode === "Employee" ? (
              emps.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">No matching employees</div>
              ) : emps.map((e) => {
                const checked = picked.has(e.id);
                const otherGroup = otherGroupByEmp.get(e.id);
                const locked = !!otherGroup;
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={locked}
                    title={locked ? `Already in "${otherGroup}" — an employee can only be in one leave group` : undefined}
                    onClick={() => { if (!locked) togglePick(e.id); }}
                    className={clsx(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded transition text-left",
                      locked ? "opacity-60 cursor-not-allowed border border-transparent"
                        : checked ? "bg-[#f0fdf4] border border-[#bbf7d0]" : "hover:bg-gray-50 border border-transparent"
                    )}
                  >
                    <div className={clsx("w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                      locked ? "border-gray-200 bg-gray-100" :
                      checked ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-gray-300")}>
                      {checked && !locked && <Check size={11} />}
                    </div>
                    {e.profilePhoto ? (
                      <img src={e.profilePhoto} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600">
                        {e.firstName[0]}{e.lastName[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{e.firstName} {e.lastName}</div>
                      <div className="text-[10px] text-gray-500 truncate">
                        {locked ? `In "${otherGroup}"` : `${e.employeeCode}${e.jobTitle ? ` · ${e.jobTitle}` : ""}`}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              roles.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">No matching roles</div>
              ) : roles.map((r) => {
                const checked = picked.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => togglePick(r.id)}
                    className={clsx(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded transition text-left",
                      checked ? "bg-[#f0fdf4] border border-[#bbf7d0]" : "hover:bg-gray-50 border border-transparent"
                    )}
                  >
                    <div className={clsx("w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                      checked ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-gray-300")}>
                      {checked && <Check size={11} />}
                    </div>
                    <Shield size={14} className="text-[#7c3aed] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{r.name}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{r.code}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={doAssign}
            disabled={picked.size === 0 || addMut.isPending}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-md text-xs font-medium"
          >
            <Plus size={13} /> Assign {picked.size > 0 ? `(${picked.size})` : ""}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Current Assignments</p>
            <span className="text-[11px] text-gray-500">{current.assignments.length} total</span>
          </div>

          <div className="max-h-[340px] overflow-y-auto space-y-1.5">
            {current.assignments.length === 0 ? (
              <div className="py-8 text-center">
                <Users size={22} className="mx-auto text-gray-300 mb-1" />
                <p className="text-xs text-gray-500">No assignments yet.</p>
              </div>
            ) : current.assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5">
                {a.assigneeType === "Employee" ? (
                  <>
                    {a.employee?.profilePhoto ? (
                      <img src={a.employee.profilePhoto} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600">
                        {a.employee?.firstName?.[0]}{a.employee?.lastName?.[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">
                        {a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : "(deleted)"}
                      </div>
                      <div className="text-[10px] text-gray-500">{a.employee?.employeeCode ?? "-"} · Individual</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-6 h-6 rounded bg-[#f5f3ff] flex items-center justify-center flex-shrink-0">
                      <Shield size={12} className="text-[#7c3aed]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{a.role?.name ?? "(deleted)"}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{a.role?.code ?? "-"} · Role</div>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeMut.mutate(a.id)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Remove"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-3 border-t border-gray-100 mt-3">
        <button type="button" onClick={onClose} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50">Close</button>
      </div>
    </Modal>
  );
}

function SubTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={clsx(
        "tab-underline inline-flex items-center gap-1 px-2.5 py-1.5 text-[13px] font-semibold -mb-px",
        active ? "text-[#16a34a]" : "text-gray-500 hover:text-gray-800",
      )}
    >
      {icon} {label}
    </button>
  );
}
