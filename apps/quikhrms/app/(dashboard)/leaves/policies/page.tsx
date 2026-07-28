"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { LeaveRulesWizard, type LeaveTypeRules } from "../_components/leave-rules-wizard";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { EmptyState } from "@/components/hrms/empty-state";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmployeesInGroupTab } from "../_components/employees-in-group-tab";
import { LeaveDashboardTab } from "../_components/leave-dashboard-tab";
import {
  Layers, Plus, Trash2, Users, Shield, Tag, UserCircle, Pencil, Check, X, Search,
  Info, CalendarDays, Hash, SlidersHorizontal, LayoutDashboard,
  ChevronRight, MoreVertical, Clock,
} from "lucide-react";

// Avatar palette for employee initials in the group detail table.
const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];
function initials(first?: string | null, last?: string | null) {
  const s = `${(first?.[0] ?? "").toUpperCase()}${(last?.[0] ?? "").toUpperCase()}`;
  return s || "?";
}
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

// Common leave types offered in the "Select leave type to add" dropdown. Picking
// one pre-fills Name + Short Code (both stay editable). "Other / Custom" clears
// them for a fully manual entry.
const LEAVE_PRESETS: { value: string; label: string; name: string; code: string }[] = [
  { value: "casual", label: "Casual Leave", name: "Casual Leave", code: "CL" },
  { value: "sick", label: "Sick Leave", name: "Sick Leave", code: "SL" },
  { value: "earned", label: "Earned / Privileged Leave", name: "Earned Leave", code: "EL" },
  { value: "maternity", label: "Maternity Leave", name: "Maternity Leave", code: "ML" },
  { value: "paternity", label: "Paternity Leave", name: "Paternity Leave", code: "PL" },
  { value: "bereavement", label: "Bereavement Leave", name: "Bereavement Leave", code: "BL" },
  { value: "marriage", label: "Marriage Leave", name: "Marriage Leave", code: "MRL" },
  { value: "compoff", label: "Comp Off", name: "Comp Off", code: "CO" },
  { value: "lop", label: "Loss of Pay (Unpaid)", name: "Loss of Pay", code: "LOP" },
  { value: "other", label: "Other / Custom", name: "", code: "" },
];

interface LeaveTypeItem {
  id: string;
  name: string;
  code: string;
  color: string | null;
  description: string | null;
  isPaid: boolean;
  accrualType: string;
  accrualCount: string;
  maxBalance: number;
  applicableAfterDays: number;
  applicableGender: string | null;
  applicableMaritalStatus: string | null;
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
  // Leave rules wizard fields
  isUnlimited?: boolean | null;
  noAccrualJoinAfterDay?: number | null;
  selfApplyAllowed?: boolean | null;
  requiresApproval?: boolean | null;
  advanceNoticeDays?: number | null;
  applicableAfterRef?: string | null;
  backdateCutoffDay?: number | null;
  blockIfBalanceLeaveTypeId?: string | null;
  requiresComment?: boolean | null;
  maxDaysPerMonth?: number | null;
  applyCutoffDay?: number | null;
  minGapDays?: number | null;
  blockedDuringNotice?: boolean | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

const EMPLOYMENT_TYPES = ["FullTime", "PartTime", "Contract", "Intern"];

interface LeaveGroupAssignment {
  id: string;
  assigneeType: "Employee" | "Role";
  employeeId: string | null;
  roleId: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string; jobTitle: string | null; profilePhoto: string | null; department?: { name: string } | null } | null;
  role?: { id: string; name: string; code: string } | null;
}

interface LeaveGroupItem {
  id: string;
  leaveTypeId: string;
  overrideQuota: string | null;
  rules?: Record<string, unknown> | null;
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
  // Deep-linkable via ?tab= (e.g. the setup checklist links to ?tab=members).
  const [tab, setTab] = useState<"types" | "groups" | "members" | "dashboard">(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return t === "groups" || t === "members" || t === "dashboard" ? t : "types";
  });
  const { hasPermission, isLoading: permsLoading, navKeys, permissions } = useDashboardConfig();
  // Managing leave types & groups requires hrms.leave.manage (also enforced by
  // the API). The Leave Dashboard is separately grantable via
  // hrms.leave.dashboard.read, so a read-only analytics role can see it without
  // the full management UI. Managers implicitly get the dashboard too.
  const canManage = hasPermission("hrms.leave.manage");
  const canViewDashboard = canManage || hasPermission("hrms.leave.dashboard.read");

  // Per-tab navigation allow-list (mirrors the sidebar): each Leave Settings tab
  // is individually grantable in Roles → Navigation. Default-allow — a role with
  // no configured navKeys (or super-admin) sees every tab its permissions allow.
  // Legacy "leave.policies" key grants the whole page for older role configs.
  const isSuper = permissions.includes("*");
  const navSet = new Set(navKeys);
  const navConfigured = !isSuper && navSet.size > 0;
  const legacyAll = navSet.has("leave.policies");
  const navAllowed = (key: string) => !navConfigured || legacyAll || navSet.has(key);

  const showTypes = canManage && navAllowed("leave.policies.types");
  const showGroups = canManage && navAllowed("leave.policies.groups");
  const showMembers = canManage && navAllowed("leave.policies.members");
  const showDashboard = canViewDashboard && navAllowed("leave.policies.dashboard");
  const firstVisibleTab = showTypes ? "types" : showGroups ? "groups" : showMembers ? "members" : showDashboard ? "dashboard" : null;

  // Land on (and stay on) the first tab the user can actually see.
  const visibleMap = { types: showTypes, groups: showGroups, members: showMembers, dashboard: showDashboard };
  useEffect(() => {
    if (!permsLoading && !visibleMap[tab] && firstVisibleTab) setTab(firstVisibleTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permsLoading, tab, showTypes, showGroups, showMembers, showDashboard, firstVisibleTab]);

  if (!permsLoading && !firstVisibleTab) {
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
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="surface-card p-1 inline-flex items-center gap-1 flex-wrap">
        {showTypes && <TabButton active={tab === "types"} onClick={() => setTab("types")} icon={<Tag size={14} />} label="Leave Types" />}
        {showGroups && <TabButton active={tab === "groups"} onClick={() => setTab("groups")} icon={<Layers size={14} />} label="Leave Groups" />}
        {showMembers && <TabButton active={tab === "members"} onClick={() => setTab("members")} icon={<Users size={14} />} label="Employees In Leave Group" />}
        {showDashboard && <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={<LayoutDashboard size={14} />} label="Leave Dashboard" />}
      </div>
      {tab === "types" && showTypes && <LeaveTypesTab />}
      {tab === "groups" && showGroups && <LeaveGroupsTab />}
      {tab === "members" && showMembers && <EmployeesInGroupTab />}
      {tab === "dashboard" && showDashboard && <LeaveDashboardTab />}
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
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState<{ open: boolean; item: LeaveTypeItem | null }>({ open: false, item: null });
  const emptyForm = {
    preset: "",
    name: "",
    code: "",
    description: "",
    allowGender: false,
    applicableGender: "Male",
    restrictMarital: false,
    applicableMaritalStatus: "Single",
  };
  const [form, setForm] = useState(emptyForm);

  // The form captures only the leave type's IDENTITY + eligibility. Entitlement,
  // accrual and the detailed rules are configured per leave type elsewhere, so
  // we send just these fields — on edit (PATCH is partial) that leaves any
  // existing quota/rules untouched. On create, the API applies its own defaults.
  const buildBody = (f: typeof form) => ({
    name: f.name.trim(),
    code: f.code.trim(),
    description: f.description.trim() || null,
    // "All" = no restriction (applies to everyone).
    applicableGender: f.allowGender ? f.applicableGender : "All",
    applicableMaritalStatus: f.restrictMarital ? f.applicableMaritalStatus : "All",
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
    { key: "sno", label: "S. No.", render: (_t, i) => <span className="text-gray-500">{i + 1}</span> },
    { key: "name", label: "Leave Name", render: (t) => <span className="font-medium text-gray-900">{t.name}</span> },
    { key: "code", label: "Short Code" },
    { key: "description", label: "Description", render: (t) => <span className="text-gray-600">{t.description || "—"}</span> },
    { key: "createdByName", label: "Created By", render: (t) => t.createdByName || "—" },
    { key: "updatedByName", label: "Last Updated By", render: (t) => t.updatedByName || "—" },
  ];

  const openAdd = () => {
    setForm(emptyForm);
    setModal({ open: true, item: null });
  };

  const openEdit = (item: LeaveTypeItem) => {
    const gender = item.applicableGender ?? "All";
    const marital = item.applicableMaritalStatus ?? "All";
    setForm({
      preset: "",
      name: item.name,
      code: item.code,
      description: item.description ?? "",
      allowGender: gender !== "All" && !!gender,
      applicableGender: gender !== "All" && gender ? gender : "Male",
      restrictMarital: marital !== "All" && !!marital,
      applicableMaritalStatus: marital !== "All" && marital ? marital : "Single",
    });
    setModal({ open: true, item });
  };

  const filtered = (data?.data ?? []).filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase())
  );
  const typeTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const typePageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <CrudTable
        title="Leave Types"
        data={typePageItems}
        columns={columns}
        isLoading={isLoading}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(id) => deleteMut.mutate(id)}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search leave types..."
        pagination={{ page, totalPages: typeTotalPages, total: filtered.length, limit: PAGE_SIZE, onPageChange: setPage }}
      />

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, item: null })}
        title={modal.item ? "Edit Leave Type" : "Add Leave Type"}
        headerIcon={<CalendarDays size={18} />}
        size="lg"
        bodyClassName="p-5 overflow-y-auto"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); modal.item ? updateMut.mutate({ id: modal.item.id, body: form }) : createMut.mutate(form); }}
          className="space-y-4"
        >
          {/* Select a preset leave type — pre-fills Name + Short Code. */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">
              Select leave type to add <span className="text-red-500">*</span>
            </label>
            <Select
              value={form.preset}
              onChange={(v) => {
                const p = LEAVE_PRESETS.find((x) => x.value === v);
                setForm({ ...form, preset: v, name: p ? p.name : form.name, code: p ? p.code : form.code });
              }}
              placeholder="Select Leave Type"
              options={LEAVE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">
                Leave Type Name <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.name} required
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Jury Duty, Privileged leave etc."
                className={PLAIN_INPUT} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">
                Short Code <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.code} required
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="Ex: PTO"
                className={PLAIN_INPUT} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Description</label>
            <textarea rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Type here"
              className={clsx(PLAIN_INPUT, "resize-y")} />
          </div>

          {/* Allow To Gender */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
              <input type="checkbox" checked={form.allowGender}
                onChange={(e) => setForm({ ...form, allowGender: e.target.checked })}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4" />
              Allow To Gender
            </label>
            <div className="w-1/2">
              <Select
                value={form.allowGender ? form.applicableGender : ""}
                onChange={(v) => setForm({ ...form, allowGender: true, applicableGender: v })}
                placeholder="Select Gender"
                options={[
                  { value: "Male", label: "Male" },
                  { value: "Female", label: "Female" },
                  { value: "Other", label: "Other" },
                ]}
              />
            </div>
          </div>

          {/* Restrict To Marital Status */}
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
              <input type="checkbox" checked={form.restrictMarital}
                onChange={(e) => setForm({ ...form, restrictMarital: e.target.checked })}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4" />
              Restrict To Employees Having Marital Status
            </label>
            <div className="w-1/2">
              <Select
                value={form.restrictMarital ? form.applicableMaritalStatus : ""}
                onChange={(v) => setForm({ ...form, restrictMarital: true, applicableMaritalStatus: v })}
                placeholder="Select Marital Status"
                options={[
                  { value: "Single", label: "Single" },
                  { value: "Married", label: "Married" },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button type="submit"
              disabled={createMut.isPending || updateMut.isPending}
              className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {modal.item
                ? (updateMut.isPending ? "Updating…" : "Update")
                : (createMut.isPending ? "Submitting…" : "Submit")}
            </button>
            <button type="button" onClick={() => setForm(modal.item ? form : emptyForm)}
              className="px-6 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-200">
              Clear
            </button>
          </div>
        </form>
      </Modal>

      {/* Per-leave-type rules — quota, accrual, carry-forward, limits, etc.
          Fields are added here later; for now the shell opens with the target. */}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"employees" | "types">("employees");
  const [moveDelete, setMoveDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ["leave-groups"],
    queryFn: () => api.get<LeaveGroup[]>("/api/v1/hrms/leaves/groups"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/leaves/groups/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-groups"] }); toast.success("Leave group deleted"); },
  });

  const handleDelete = async (group: LeaveGroup) => {
    // A group with assignees can't be deleted until they're moved elsewhere.
    if (group.assignments.length > 0) {
      setMoveDelete({ id: group.id, name: group.name });
      return;
    }
    const ok = await confirm({
      title: "Delete leave group?",
      description: `"${group.name}" will be removed. This cannot be undone.`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (ok) deleteMut.mutate(group.id);
  };

  const groups = groupsData?.data ?? [];

  const selected = groups.find((g) => g.id === selectedId) ?? groups[0] ?? null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,360px)_1fr] gap-5 items-start">
        {/* ── LEFT: group list ───────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Leave Groups</h2>
              <p className="text-[11.5px] text-gray-500 mt-0.5 max-w-[230px] leading-snug">Organize employees into leave groups and manage their leave entitlements.</p>
            </div>
            <button
              onClick={() => setGroupModal({ open: true, group: null })}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus size={14} /> Add Group
            </button>
          </div>

          {isLoading ? (
            <div className="py-10 text-center text-xs text-gray-500">Loading…</div>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center">
              <Layers size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-500">No leave groups yet.</p>
              <p className="text-xs text-gray-400">Create one to bundle leave types and assign to employees.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const active = selected?.id === g.id;
                const empCount = g.assignments.filter((a) => a.assigneeType === "Employee").length;
                return (
                  <div
                    key={g.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSelectedId(g.id); setDetailTab("employees"); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedId(g.id); setDetailTab("employees"); } }}
                    className={clsx(
                      "w-full cursor-pointer text-left rounded-xl border p-3.5 transition",
                      active ? "border-green-500 bg-green-50/60 ring-1 ring-green-500/20" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={clsx("h-9 w-9 shrink-0 rounded-lg grid place-items-center", active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                        <Users size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[13px] font-semibold text-gray-900 truncate">{g.name}</h3>
                          <span className={clsx("text-[9.5px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide", g.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                            {g.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        {g.description && <p className="text-[11.5px] text-gray-500 mt-0.5 truncate">{g.description}</p>}
                      </div>
                      <ChevronRight size={15} className={clsx("shrink-0 mt-1", active ? "text-green-600" : "text-gray-300")} />
                    </div>
                    <div className="flex items-center justify-between mt-2.5 pl-[46px]">
                      <div className="flex items-center gap-4 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1"><Tag size={12} /> {g.items.length} leave type{g.items.length === 1 ? "" : "s"}</span>
                        <span className="inline-flex items-center gap-1"><Users size={12} /> {empCount} employee{empCount === 1 ? "" : "s"}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); setGroupModal({ open: true, group: g }); }} className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-gray-700"><Pencil size={13} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(g); }} className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── RIGHT: group detail ────────────────────────── */}
        <div>
          {selected ? (
            <GroupDetail
              group={selected}
              tab={detailTab}
              setTab={setDetailTab}
              onAssign={() => setAssignModal({ open: true, group: selected })}
            />
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 min-h-[420px] grid place-items-center text-center">
              <div>
                <Layers size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">Select a group to view its details.</p>
              </div>
            </div>
          )}
        </div>
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

      {moveDelete && (
        <LeaveMoveDeleteModal
          sourceId={moveDelete.id}
          sourceName={moveDelete.name}
          targets={groups.filter((g) => g.id !== moveDelete.id).map((g) => ({ id: g.id, name: g.name }))}
          onClose={() => setMoveDelete(null)}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ["leave-groups"] });
            if (selectedId === moveDelete.id) setSelectedId(null);
            setMoveDelete(null);
          }}
        />
      )}
    </>
  );
}

function LeaveMoveDeleteModal({ sourceId, sourceName, targets, onClose, onDeleted }: {
  sourceId: string; sourceName: string; targets: { id: string; name: string }[];
  onClose: () => void; onDeleted: () => void;
}) {
  const api = useApiClient();
  const toast = useToast();
  const [target, setTarget] = useState("");
  const mut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/leaves/groups/${sourceId}?moveToGroupId=${target}`),
    onSuccess: () => { toast.success("Assignees moved & group deleted"); onDeleted(); onClose(); },
    onError: () => toast.error("Couldn't move & delete"),
  });
  return (
    <Modal open onClose={onClose} title={`Delete "${sourceName}"`} size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">This group still has assignees. Move them to another group, then it will be deleted.</p>
        {targets.length === 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
            No other leave group to move assignees to. Create one first.
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Move assignees to</label>
            <Select placeholder="Select a group…" value={target} onChange={(v) => setTarget(v)} options={targets.map((t) => ({ value: t.id, label: t.name }))} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button type="button" onClick={() => target && mut.mutate()} disabled={!target || mut.isPending} className="btn btn-danger btn-sm">
            <Trash2 size={13} /> Move &amp; delete
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── GROUP DETAIL (master-detail right pane) ─────────────

function GroupDetail({ group, tab, setTab, onAssign }: {
  group: LeaveGroup;
  tab: "employees" | "types";
  setTab: (t: "employees" | "types") => void;
  onAssign: () => void;
}) {
  const api = useApiClient();
  // The list endpoint returns assignment rows without hydrated employees, so
  // fetch the group's own detail (which hydrates employee + department) for the
  // members table. Falls back to the list row while it loads.
  const { data: detailData } = useQuery({
    queryKey: ["leave-group-detail", group.id],
    queryFn: () => api.get<LeaveGroup>(`/api/v1/hrms/leaves/groups/${group.id}`),
  });
  const g = detailData?.data ?? group;

  const empAssignments = g.assignments.filter((a) => a.assigneeType === "Employee");
  const empCount = empAssignments.length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="h-[52px] w-[52px] shrink-0 rounded-xl bg-green-100 text-green-700 grid place-items-center">
            <Users size={24} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[15px] font-bold text-gray-900">{g.name}</h2>
              <span className={clsx("text-[9.5px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide", g.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                {g.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1"><Tag size={12} /> {g.items.length} leave types</span>
              <span className="text-gray-300">•</span>
              <span className="inline-flex items-center gap-1"><Users size={12} /> {empCount} employees</span>
            </p>
            {g.description && <p className="text-xs text-gray-400 mt-1 truncate">{g.description}</p>}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-6 border-b border-gray-200 mt-5">
        <DetailTab active={tab === "employees"} onClick={() => setTab("employees")} icon={<Users size={14} />} label="Employees" />
        <DetailTab active={tab === "types"} onClick={() => setTab("types")} icon={<CalendarDays size={14} />} label="Leave Types" />
      </div>

      {/* content */}
      <div className="mt-4">
        {tab === "employees" && (
          <div>
            <div className="flex items-start justify-between gap-3 mb-3.5">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Employees in this group ({empCount})</h3>
                <p className="text-xs text-gray-500 mt-0.5">These employees will follow the leave rules and quotas of this group.</p>
              </div>
              <button onClick={onAssign} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm">
                <Plus size={14} /> Assign Employees
              </button>
            </div>
            {empCount === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                <Users size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-500">No employees assigned yet.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-green-50 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2.5">Employee</th>
                      <th className="px-4 py-2.5">Job</th>
                      <th className="px-4 py-2.5">Department</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {empAssignments.map((a, i) => {
                      const e = a.employee;
                      return (
                        <tr key={a.id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className={clsx("h-8 w-8 rounded-full grid place-items-center text-[11px] font-semibold", AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                                {initials(e?.firstName, e?.lastName)}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900 text-[12.5px]">{e ? `${e.firstName} ${e.lastName}` : "—"}</p>
                                <p className="text-[11px] text-gray-400">{e?.employeeCode ?? "—"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{e?.jobTitle || "—"}</td>
                          <td className="px-4 py-2.5 text-gray-600">{e?.department?.name || "—"}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><MoreVertical size={15} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "types" && (
          g.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
              <CalendarDays size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-500">No leave types in this group.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {g.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                  <div className="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-white text-[10.5px] font-bold" style={{ background: it.leaveType.color || "#16a34a" }}>
                    {it.leaveType.code}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-[13px] truncate">{it.leaveType.name}</p>
                    <p className="text-[11px] text-gray-400">{it.overrideQuota ? `${it.overrideQuota} days` : "Default quota"}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

      </div>

      {/* stat cards */}
      <div className="mt-5 rounded-xl bg-green-50/60 border border-green-100 grid grid-cols-2 md:grid-cols-4 divide-x divide-green-100">
        <Stat icon={<Users size={17} />} value={empCount} label="Total Employees" />
        <Stat icon={<CalendarDays size={17} />} value={g.items.length} label="Leave Types" />
        <Stat icon={<Shield size={17} />} value="Employee-wise" label="Group Type" small />
        <Stat icon={<Clock size={17} />} value={g.isActive ? "Active" : "Inactive"} label="Status" small />
      </div>
    </div>
  );
}

function DetailTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 pb-2.5 -mb-px text-[13px] font-medium border-b-2 transition",
        active ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700",
      )}
    >
      {icon} {label}
    </button>
  );
}


function Stat({ icon, value, label, small }: { icon: React.ReactNode; value: React.ReactNode; label: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-white grid place-items-center text-green-600 shadow-sm">{icon}</div>
      <div className="min-w-0">
        <p className={clsx("font-bold text-gray-900 truncate", small ? "text-[13px]" : "text-lg")}>{value}</p>
        <p className="text-[11px] text-gray-500">{label}</p>
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
      rules: (i.rules ?? null) as Record<string, unknown> | null,
    })),
  });
  // The leave type whose per-group rules are being edited (opens the wizard).
  const [rulesFor, setRulesFor] = useState<string | null>(null);

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
      : { ...p, items: [...p.items, { leaveTypeId: id, overrideQuota: null, rules: null }] }
    );
  };

  const saveItemRules = async (leaveTypeId: string, payload: Record<string, unknown>) => {
    const nextItems = form.items.map((i) => i.leaveTypeId === leaveTypeId ? { ...i, rules: payload } : i);
    setForm((p) => ({ ...p, items: nextItems }));
    // If the group already exists, persist the rules to the DB immediately so the
    // user doesn't have to remember to click "Save Changes" afterwards.
    if (group) {
      await api.patch(`/api/v1/hrms/leaves/groups/${group.id}`, { ...form, items: nextItems });
      qc.invalidateQueries({ queryKey: ["leave-groups"] });
    }
    setRulesFor(null);
  };

  return (
    <Modal open onClose={onClose} title={group ? "Edit Leave Group" : "New Leave Group"} size="xl">
      <form onSubmit={submit} className="space-y-4">
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
                      <div className="text-[10px] text-gray-500">
                        {t.code} · {(() => {
                          const r = item?.rules as { isUnlimited?: boolean; maxBalance?: number } | undefined;
                          if (r?.isUnlimited) return "Unlimited";
                          if (r && typeof r.maxBalance === "number") return `${r.maxBalance} days/yr`;
                          return `${t.maxBalance} days/yr`;
                        })()}
                      </div>
                    </div>
                    {/* Rules are configured only when editing an existing group
                        (the "configure after" step). Creating = pick types only. */}
                    {selected && group && (
                      <button
                        type="button"
                        onClick={() => setRulesFor(t.id)}
                        title="Configure this leave's rules for this group"
                        className={clsx(
                          "shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md border transition",
                          item?.rules ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 text-gray-500 hover:bg-gray-50",
                        )}
                      >
                        <SlidersHorizontal size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-gray-500 mt-1">
            {group
              ? "Configure each type's rules (⚙) for this group."
              : "Pick the leave types for this group. You'll set each one's rules after creating it."}
          </p>
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

      {rulesFor && (() => {
        const rt = allTypes.find((t) => t.id === rulesFor);
        const it = form.items.find((i) => i.leaveTypeId === rulesFor);
        if (!rt) return null;
        const stored = (it?.rules ?? {}) as Record<string, unknown>;
        return (
          <Modal open onClose={() => setRulesFor(null)} title={`${rt.name} · Rules (this group)`}
            subtitle="These rules apply to this leave type within this group only." headerIcon={<SlidersHorizontal size={18} />}
            size="3xl" bodyClassName="p-6 overflow-y-auto">
            <LeaveRulesWizard
              leaveType={{ id: rt.id, name: rt.name, code: rt.code, maxBalance: Number(stored.maxBalance ?? rt.maxBalance ?? 0), ...stored } as LeaveTypeRules}
              allTypes={allTypes.map((t) => ({ id: t.id, name: t.name, code: t.code }))}
              onClose={() => setRulesFor(null)}
              onSave={(payload) => saveItemRules(rulesFor, payload)}
            />
          </Modal>
        );
      })()}
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
    // Hide employees already in THIS group and anyone already in ANOTHER group
    // (one employee = one leave group).
    return !assignedEmpIds.has(e.id) && !otherGroupByEmp.has(e.id) && (!search || full.includes(search.toLowerCase()));
  });
  const roles = (rolesData?.data ?? []).filter((r) =>
    !assignedRoleIds.has(r.id) && (!search || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  const togglePick = (id: string) =>
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const visibleIds = mode === "Employee" ? emps.map((e) => e.id) : roles.map((r) => r.id);
  const allVisiblePicked = visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));
  const toggleSelectAll = () => setPicked(allVisiblePicked ? new Set() : new Set(visibleIds));

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

          {visibleIds.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <button type="button" onClick={toggleSelectAll} className="text-[11px] font-medium text-green-700 hover:underline">
                {allVisiblePicked ? "Clear all" : `Select all (${visibleIds.length})`}
              </button>
              {picked.size > 0 && <span className="text-[11px] text-gray-500">{picked.size} selected</span>}
            </div>
          )}

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
