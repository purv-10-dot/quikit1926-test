"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { MAX_BULK_UPLOAD_ROWS } from "@/lib/validations/gap-fill";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { PageBackground } from "@/components/hrms/page-background";
import { clsx } from "clsx";
import * as XLSX from "xlsx";
import { UserPlus, Mail, RotateCw, Ban, Send, Upload, FileSpreadsheet, Download, X, Trash2, Search } from "lucide-react";

interface Role { id: string; name: string }

interface BulkRow { email: string; firstName: string; lastName: string; roles: string }
interface BulkResult {
  total: number;
  created: number;
  sent: number;
  emailFailed: number;
  skipped: { email: string; reason: string }[];
}

interface Invitation {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roleNames: string[];
  status: "Pending" | "Accepted" | "Expired" | "Revoked";
  invitedByName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

/** An existing central QuikIT org member, surfaced as an invite suggestion. */
interface MemberSuggestion {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  memberRole: string;
}

/** An existing (provisioned) user — including the first Org Admin. */
interface OrgUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  workEmail: string | null;
  jobTitle: string | null;
  status: string;
  role: { name: string } | null;
}

const STATUS_STYLE: Record<Invitation["status"], string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Expired: "bg-gray-100 text-gray-500 ring-gray-200",
  Revoked: "bg-red-50 text-red-600 ring-red-200",
};

/** A single row in the unified list — an existing user, a not-yet-invited
 *  employee, or an invitation record. */
interface UnifiedRow {
  key: string;
  name: string;
  email: string;
  role: string;
  status: string;
  kind: "user" | "invitable" | "invitation";
  invitation?: Invitation;
  employeeId?: string;
  hasEmail?: boolean;
}

function statusBadgeClass(status: string): string {
  const s = STATUS_STYLE[status as Invitation["status"]];
  if (s) return s;
  if (status === "Active") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "Not invited") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-gray-100 text-gray-600 ring-gray-200";
}

export default function UsersPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();

  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    roleIds: [] as string[],
    invitationMethod: "native" as "native" | "sso",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // ── Existing-member typeahead (Add New User modal) ──
  // When the admin picks someone who's already a central QuikIT member, we
  // prefill their name and hide Invitation Method (existing users are linked,
  // never re-issued a password).
  const [isExistingMember, setIsExistingMember] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [emailDebounced, setEmailDebounced] = useState("");

  // ── Bulk import state ──
  const [showBulk, setShowBulk] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkDefaultRoles, setBulkDefaultRoles] = useState<string[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  const { data: invitesResp, isLoading } = useQuery({
    queryKey: ["invitations"],
    queryFn: () => api.get<Invitation[]>("/api/v1/hrms/invitations"),
  });
  const invitations = useMemo(() => invitesResp?.data ?? [], [invitesResp]);

  // Existing provisioned users (the first Org Admin + everyone added since).
  // Mirrors quikscale/quiktrack, which list the org's members — not just
  // pending invitations — so the application administrator is always visible.
  const { data: usersResp, isLoading: usersLoading } = useQuery({
    queryKey: ["org-users"],
    // `provisioned=true` → only employees with a login account (SSO-linked or
    // native password), not every active employee.
    queryFn: () => api.get<OrgUser[]>("/api/v1/hrms/employees?limit=200&provisioned=true"),
  });
  const users = useMemo(() => usersResp?.data ?? [], [usersResp]);

  // Employees who can still be invited: no login account + no Pending invite.
  // These are people added via People / bulk import / onboarding who haven't
  // been sent a portal invite yet — invited manually from here.
  const { data: invitableResp, isLoading: invitableLoading } = useQuery({
    queryKey: ["invitable-employees"],
    queryFn: () => api.get<OrgUser[]>("/api/v1/hrms/employees?limit=200&invitable=true"),
  });
  const invitable = useMemo(() => invitableResp?.data ?? [], [invitableResp]);

  const { data: rolesResp } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<Role[]>("/api/v1/hrms/settings/roles"),
  });
  const roles = rolesResp?.data ?? [];

  const resetForm = () => {
    setForm({ email: "", firstName: "", lastName: "", roleIds: [], invitationMethod: "native" });
    setIsExistingMember(false);
    setShowSuggest(false);
    setEmailDebounced("");
  };

  // Debounce the email input before hitting the member-search endpoint.
  useEffect(() => {
    const t = setTimeout(() => setEmailDebounced(form.email.trim()), 250);
    return () => clearTimeout(t);
  }, [form.email]);

  // Suggest existing central members while typing — but not once one is picked.
  const { data: suggestResp } = useQuery({
    queryKey: ["member-search", emailDebounced],
    queryFn: () => api.get<MemberSuggestion[]>(`/api/v1/hrms/members/search?q=${encodeURIComponent(emailDebounced)}`),
    enabled: showInvite && !isExistingMember && emailDebounced.length >= 2,
  });
  const suggestions = suggestResp?.data ?? [];

  /** Pick an existing member: prefill name + email, mark as linked. */
  function selectMember(m: MemberSuggestion) {
    setForm((f) => ({ ...f, email: m.email, firstName: m.firstName, lastName: m.lastName }));
    setIsExistingMember(true);
    setShowSuggest(false);
  }

  function closeInvite() {
    setShowInvite(false);
    resetForm();
  }

  const inviteMut = useMutation({
    mutationFn: (body: typeof form) =>
      api.post<{ emailSent: boolean }>("/api/v1/hrms/invitations", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setShowInvite(false);
      resetForm();
    },
  });

  // Send the portal invite for an existing employee (the "Not yet invited" list).
  const inviteEmployeeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/employees/${id}/invite`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      qc.invalidateQueries({ queryKey: ["invitable-employees"] });
      qc.invalidateQueries({ queryKey: ["org-users"] });
      toast.success("Invitation sent");
    },
  });

  const resendMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/invitations/${id}/resend`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/invitations/${id}/revoke`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation revoked");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/invitations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation deleted");
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api.post<{ deleted: number }>("/api/v1/hrms/invitations/bulk-delete", { ids }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setSelected(new Set());
      toast.success(`${res.data.deleted} invitation${res.data.deleted === 1 ? "" : "s"} deleted`);
    },
  });

  const bulkMut = useMutation({
    mutationFn: (body: { fileName: string; rows: BulkRow[]; defaultRoleIds: string[] }) =>
      api.post<BulkResult>("/api/v1/hrms/invitations/bulk", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setBulkResult(res.data);
    },
    meta: { suppressGlobalError: true },
    onError: (e) => setBulkError(e instanceof ApiError ? e.message : "Import failed"),
  });

  const resetBulk = () => {
    setBulkRows([]); setBulkFileName(""); setBulkDefaultRoles([]); setBulkError(null); setBulkResult(null);
  };

  /** Parse a CSV/XLSX file in the browser into rows (no server round-trip yet). */
  function onBulkFile(file: File) {
    setBulkError(null);
    setBulkResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        const norm = (r: Record<string, unknown>, keys: string[]) => {
          for (const k of Object.keys(r)) {
            if (keys.includes(k.trim().toLowerCase())) return String(r[k] ?? "").trim();
          }
          return "";
        };
        const rows: BulkRow[] = raw.map((r) => ({
          email: norm(r, ["email", "work email", "e-mail"]),
          firstName: norm(r, ["firstname", "first name", "first"]),
          lastName: norm(r, ["lastname", "last name", "last"]),
          roles: norm(r, ["roles", "role"]),
        })).filter((r) => r.email || r.firstName || r.lastName);

        if (rows.length === 0) { setBulkError("No data rows found in the file."); return; }
        if (rows.length > MAX_BULK_UPLOAD_ROWS) { setBulkError(`You can invite at most ${MAX_BULK_UPLOAD_ROWS} users at a time — this file has ${rows.length}. Split it into smaller batches.`); return; }
        setBulkRows(rows);
        setBulkFileName(file.name);
      } catch {
        setBulkError("Could not read the file. Use the CSV template.");
      }
    };
    reader.readAsBinaryString(file);
  }

  function downloadTemplate() {
    const csv = "email,firstName,lastName,roles\njane.doe@company.com,Jane,Doe,employee\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "invite-template.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const bulkValid = useMemo(
    () => bulkRows.every((r) => /\S+@\S+\.\S+/.test(r.email) && r.firstName && r.lastName),
    [bulkRows],
  );

  // Role is optional — empty roleIds means "Use org default".
  const canSubmit = useMemo(
    () => /\S+@\S+\.\S+/.test(form.email) && Boolean(form.firstName.trim()) && Boolean(form.lastName.trim()),
    [form],
  );

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20";

  // Single-select role; empty = "Use org default".
  const selectedRoleId = form.roleIds[0] ?? "";
  const setRole = (id: string) => setForm((f) => ({ ...f, roleIds: id ? [id] : [] }));

  async function onRevoke(inv: Invitation) {
    const ok = await dialog.confirm({
      title: "Revoke invitation?",
      description: `${inv.email} will no longer be able to use their activation link.`,
      variant: "danger",
      confirmLabel: "Revoke",
    });
    if (ok) revokeMut.mutate(inv.id);
  }

  async function onDelete(inv: Invitation) {
    const ok = await dialog.confirm({
      title: "Delete invitation?",
      description: `The invitation record for ${inv.email} will be removed from the list. ${inv.status === "Accepted" ? "Their existing account is not affected." : ""}`.trim(),
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (ok) deleteMut.mutate(inv.id);
  }

  const q = search.trim().toLowerCase();

  // One unified list: provisioned users (any status) + not-yet-invited employees
  // + invitation records. An Accepted invitation whose email already has an
  // account is deduped away so nobody shows twice.
  const rows = useMemo<UnifiedRow[]>(() => {
    const userEmails = new Set(users.map((u) => (u.workEmail ?? "").toLowerCase()).filter(Boolean));
    const fullName = (f: string | null, l: string | null, dn?: string | null) =>
      dn || [f, l].filter(Boolean).join(" ") || "—";
    const out: UnifiedRow[] = [];
    for (const u of users) {
      out.push({ key: `user-${u.id}`, name: fullName(u.firstName, u.lastName, u.displayName), email: u.workEmail ?? "", role: u.role?.name ?? "—", status: u.status, kind: "user" });
    }
    for (const u of invitable) {
      out.push({ key: `invitable-${u.id}`, name: fullName(u.firstName, u.lastName, u.displayName), email: u.workEmail ?? "", role: u.role?.name ?? "—", status: "Not invited", kind: "invitable", employeeId: u.id, hasEmail: !!u.workEmail });
    }
    for (const inv of invitations) {
      if (inv.status === "Accepted" && userEmails.has(inv.email.toLowerCase())) continue;
      out.push({ key: `invitation-${inv.id}`, name: fullName(inv.firstName, inv.lastName), email: inv.email, role: inv.roleNames.join(", ") || "—", status: inv.status, kind: "invitation", invitation: inv });
    }
    return out;
  }, [users, invitable, invitations]);

  const statusOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).sort(), [rows]);

  const visibleRows = useMemo(() => rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (!q) return true;
    return [r.name, r.email, r.role, r.status].filter(Boolean).some((v) => v.toLowerCase().includes(q));
  }), [rows, statusFilter, q]);

  const anyLoading = usersLoading || invitableLoading || isLoading;

  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Only invitation rows are bulk-deletable.
  const selectableIds = visibleRows.filter((r) => r.kind === "invitation").map((r) => r.invitation!.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));
  const toggleSelectAll = () =>
    setSelected(() => (allSelected ? new Set() : new Set(selectableIds)));

  async function onBulkDelete() {
    if (selected.size === 0) return;
    const ok = await dialog.confirm({
      title: `Delete ${selected.size} invitation${selected.size === 1 ? "" : "s"}?`,
      description: "The selected invitation records will be removed from the list. Existing accepted-user accounts are not affected.",
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (ok) bulkDeleteMut.mutate(Array.from(selected));
  }

  return (
    <div className="w-full">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Users & Invitations</h1>
          <p className="mt-1 text-xs text-gray-500">Invite people by email and manage pending invitations.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={onBulkDelete}
              disabled={bulkDeleteMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={13} /> {bulkDeleteMut.isPending ? "Deleting…" : `Delete selected (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, role or status…"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-xs outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
          style={{ paddingLeft: "2.25rem" }}
        />
      </div>

      {/* One unified list — everyone (users, not-yet-invited, invitations),
          filterable by status. */}
      <div className="mb-3 max-w-[200px]">
        <Select
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          options={[{ value: "", label: "All statuses" }, ...statusOptions.map((s) => ({ value: s, label: s }))]}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-table-head uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-2.5 font-semibold">Person</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Invited by</th>
              <th className="px-4 py-2.5 font-semibold">Expires</th>
              <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {anyLoading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{rows.length === 0 ? "No users yet." : "No users match your filter."}</td></tr>
            ) : (
              visibleRows.map((r) => {
                const inv = r.invitation;
                const isSel = inv ? selected.has(inv.id) : false;
                const busy = r.kind === "invitable" && inviteEmployeeMut.isPending && inviteEmployeeMut.variables === r.employeeId;
                return (
                  <tr key={r.key} className={clsx("border-b border-gray-50 last:border-0", isSel && "bg-green-50/40")}>
                    <td className="px-4 py-2.5">
                      {inv && (
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(inv.id)}
                          className="rounded border-gray-300"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-[13px] font-medium text-gray-900">{r.name}</div>
                      {r.email && (
                        <div className="flex items-center gap-1 text-[11px] text-gray-500"><Mail size={12} /> {r.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{r.role}</td>
                    <td className="px-4 py-2.5">
                      <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", statusBadgeClass(r.status))}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{inv?.invitedByName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500">{inv ? new Date(inv.expiresAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        {r.kind === "invitable" && (
                          <button
                            type="button"
                            onClick={() => inviteEmployeeMut.mutate(r.employeeId!)}
                            disabled={!r.hasEmail || busy}
                            title={r.hasEmail ? "Send portal invite" : "No work email on file"}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            <Send size={12} /> {busy ? "Inviting…" : "Invite"}
                          </button>
                        )}
                        {inv && (inv.status === "Pending" || inv.status === "Expired") && (
                          <>
                            <button
                              onClick={() =>
                                toast.promise(resendMut.mutateAsync(inv.id), {
                                  loading: "Resending invitation…",
                                  success: "Invitation resent",
                                  error: "Couldn't resend the invitation",
                                })
                              }
                              disabled={resendMut.isPending}
                              title="Resend invitation"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                            >
                              <RotateCw size={12} /> Resend
                            </button>
                            <button
                              onClick={() => onRevoke(inv)}
                              disabled={revokeMut.isPending}
                              title="Revoke invitation"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              <Ban size={12} /> Revoke
                            </button>
                          </>
                        )}
                        {inv && (
                          <button
                            onClick={() => onDelete(inv)}
                            disabled={deleteMut.isPending}
                            title="Delete invitation"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showInvite}
        onClose={closeInvite}
        title="Add New User"
        subtitle="Create a user account and grant access to this workspace."
        headerIcon={<UserPlus size={18} />}
        bodyClassName="p-4 overflow-y-auto"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">First Name <span className="text-red-500">*</span></label>
              <input
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                placeholder="Jane"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Last Name <span className="text-red-500">*</span></label>
              <input
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                placeholder="Doe"
                className={inputCls}
              />
            </div>
          </div>

          <div className="relative">
            <label className="mb-1 block text-sm font-medium text-gray-700">Email Address <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, email: v }));
                // Editing the email after a pick breaks the link — bring the
                // invitation method back and re-enable suggestions.
                if (isExistingMember) setIsExistingMember(false);
                setShowSuggest(true);
              }}
              onFocus={() => setShowSuggest(true)}
              // Delay so an option's onMouseDown selection still registers.
              onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
              placeholder="jane@company.com"
              autoComplete="off"
              className={inputCls}
            />
            {showSuggest && !isExistingMember && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {suggestions.map((m) => (
                  <li key={m.userId}>
                    <button
                      type="button"
                      // onMouseDown fires before the input's blur, so the pick lands.
                      onMouseDown={(e) => { e.preventDefault(); selectMember(m); }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-green-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-gray-900">
                          {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email}
                        </span>
                        <span className="block truncate text-[12.5px] text-gray-500">{m.email}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        Existing member
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {isExistingMember ? (
              <p className="mt-1.5 text-[12.5px] text-emerald-600">
                Existing QuikIT member — they&apos;ll be linked automatically. No invitation method needed.
              </p>
            ) : (
              <p className="mt-1.5 text-[12.5px] text-gray-400">
                If this email already belongs to a QuikIT user, they&apos;re linked automatically — no duplicate account is created.
              </p>
            )}
          </div>

          {!isExistingMember && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Invitation Method</label>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  { id: "native", title: "Native (Email + Password)", desc: "A temporary password is emailed; user signs in with it." },
                  { id: "sso", title: "SSO (Google / Microsoft)", desc: "No password. User signs in via their existing provider." },
                ] as const).map((m) => {
                  const active = form.invitationMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, invitationMethod: m.id }))}
                      className={clsx(
                        "rounded-xl border-2 p-3 text-left transition",
                        active ? "border-green-500 bg-green-50/40" : "border-gray-200 bg-white hover:bg-gray-50",
                      )}
                    >
                      <div className={clsx("text-[11px] font-semibold", active ? "text-gray-900" : "text-gray-700")}>{m.title}</div>
                      <div className="mt-0.5 text-[12px] leading-snug text-gray-500">{m.desc}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-[12.5px] leading-relaxed text-green-700">
                {form.invitationMethod === "native"
                  ? "A temporary QuikIT password is emailed to brand-new users; they set their own on first sign-in. Works for any email."
                  : "No password. The user signs in with their Google or Microsoft account via QuikIT. Requires a Google/Microsoft email."}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
            <Select
              className="w-full"
              clearable
              placeholder="Use org default"
              value={selectedRoleId}
              onChange={(v) => setRole(v)}
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
            />
            <p className="mt-1.5 text-[12.5px] text-gray-400">
              This is their role inside HRMS. In QuikIT they&apos;re added as a member.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={closeInvite}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                toast.promise(inviteMut.mutateAsync(form), {
                  loading: "Sending invitation…",
                  success: (res) =>
                    res.data.emailSent
                      ? "Invitation sent — an email with sign-in details was sent."
                      : "User added, but the email could not be sent (check SMTP config).",
                  error: "Couldn't send the invitation",
                })
              }
              disabled={!canSubmit || inviteMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              <Send size={13} /> {inviteMut.isPending ? "Adding…" : "Add User"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Bulk import ── */}
      <Modal
        open={showBulk}
        onClose={() => setShowBulk(false)}
        title="Bulk Import Users"
        subtitle="Upload a CSV to invite many people at once. Emails are sent in the background."
        headerIcon={<Upload size={18} />}
        bodyClassName="p-4 overflow-y-auto"
      >
        {bulkResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Invited", value: bulkResult.created, cls: "text-emerald-600" },
                { label: "Sent", value: bulkResult.sent, cls: "text-green-600" },
                { label: "Skipped", value: bulkResult.skipped.length, cls: "text-amber-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                  <div className={clsx("text-2xl font-bold", s.cls)}>{s.value}</div>
                  <div className="text-[12px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
            {bulkResult.emailFailed > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                {bulkResult.emailFailed} email(s) could not be sent — check the SMTP settings in .env.local.
              </p>
            )}
            {bulkResult.skipped.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Reason</th></tr>
                  </thead>
                  <tbody>
                    {bulkResult.skipped.map((s, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-700">{s.email || "—"}</td>
                        <td className="px-3 py-1.5 text-gray-500">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={resetBulk} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">Import another</button>
              <button onClick={() => setShowBulk(false)} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700">Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2.5 text-[11px] text-green-700">
              <span>Columns: <strong>email, firstName, lastName, roles</strong> (roles optional).</span>
              <button onClick={downloadTemplate} className="inline-flex items-center gap-1 font-semibold hover:underline">
                <Download size={13} /> Template
              </button>
            </div>

            {bulkRows.length === 0 ? (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center transition hover:border-green-400 hover:bg-green-50/40">
                <FileSpreadsheet size={26} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-700">Click to upload CSV</span>
                <span className="text-[12px] text-gray-400">.csv or .xlsx — up to {MAX_BULK_UPLOAD_ROWS} rows</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onBulkFile(f); e.target.value = ""; }}
                />
              </label>
            ) : (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-gray-700">
                    <FileSpreadsheet size={15} className="text-green-600" />
                    <span className="font-medium">{bulkFileName}</span>
                    <span className="text-gray-400">· {bulkRows.length} rows</span>
                  </div>
                  <button onClick={() => { setBulkRows([]); setBulkFileName(""); }} className="text-gray-400 hover:text-gray-600" title="Remove">
                    <X size={12} />
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
                      <tr><th className="px-3 py-1.5 font-medium">Email</th><th className="px-3 py-1.5 font-medium">Name</th><th className="px-3 py-1.5 font-medium">Roles</th></tr>
                    </thead>
                    <tbody>
                      {bulkRows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className={clsx("px-3 py-1.5", /\S+@\S+\.\S+/.test(r.email) ? "text-gray-700" : "text-red-500")}>{r.email || "—"}</td>
                          <td className="px-3 py-1.5 text-gray-600">{`${r.firstName} ${r.lastName}`.trim() || "—"}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.roles || <span className="text-gray-400">default</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bulkRows.length > 50 && <p className="px-3 py-1.5 text-[12px] text-gray-400">+ {bulkRows.length - 50} more…</p>}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Default role(s) <span className="font-normal text-gray-400">— applied to rows with no roles column</span>
              </label>
              {roles.length === 0 ? (
                <p className="text-[11px] text-gray-400">No roles found.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {roles.map((r) => {
                    const active = bulkDefaultRoles.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setBulkDefaultRoles((s) => s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id])}
                        className={clsx(
                          "rounded-full px-3 py-1 text-[11px] font-medium ring-1 transition",
                          active ? "bg-green-600 text-white ring-green-600" : "bg-white text-gray-600 ring-gray-300 hover:bg-gray-50",
                        )}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {bulkError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{bulkError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowBulk(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">Cancel</button>
              <button
                onClick={() =>
                  toast.promise(
                    bulkMut.mutateAsync({ fileName: bulkFileName, rows: bulkRows, defaultRoleIds: bulkDefaultRoles }),
                    {
                      loading: "Sending invitations…",
                      success: (res) => `${res.data.created} invited, ${res.data.sent} emails sent, ${res.data.skipped.length} skipped.`,
                      error: "Couldn't process the import",
                    },
                  )
                }
                disabled={bulkRows.length === 0 || !bulkValid || bulkMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                <Send size={13} /> {bulkMut.isPending ? "Importing…" : `Import ${bulkRows.length || ""}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
