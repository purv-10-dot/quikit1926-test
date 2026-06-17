"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { MAX_BULK_UPLOAD_ROWS } from "@/lib/validations/gap-fill";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
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
  const invitations = invitesResp?.data ?? [];

  // Existing provisioned users (the first Org Admin + everyone added since).
  // Mirrors quikscale/quiktrack, which list the org's members — not just
  // pending invitations — so the application administrator is always visible.
  const { data: usersResp, isLoading: usersLoading } = useQuery({
    queryKey: ["org-users"],
    queryFn: () => api.get<OrgUser[]>("/api/v1/hrms/employees?limit=200"),
  });
  const users = usersResp?.data ?? [];

  const { data: rolesResp } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<Role[]>("/api/v1/hrms/settings/roles"),
  });
  const roles = rolesResp?.data ?? [];

  const resetForm = () =>
    setForm({ email: "", firstName: "", lastName: "", roleIds: [], invitationMethod: "native" });

  const inviteMut = useMutation({
    mutationFn: (body: typeof form) =>
      api.post<{ emailSent: boolean }>("/api/v1/hrms/invitations", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setShowInvite(false);
      resetForm();
      toast.success(
        "User added",
        res.data.emailSent ? "An email with sign-in details was sent." : "Added, but the email could not be sent (check SMTP config).",
      );
    },
    onError: (e) => toast.error("Could not invite", e instanceof ApiError ? e.message : "Please try again"),
  });

  const resendMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/invitations/${id}/resend`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation resent");
    },
    onError: (e) => toast.error("Resend failed", e instanceof ApiError ? e.message : "Please try again"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/invitations/${id}/revoke`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation revoked");
    },
    onError: (e) => toast.error("Revoke failed", e instanceof ApiError ? e.message : "Please try again"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/invitations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation deleted");
    },
    onError: (e) => toast.error("Delete failed", e instanceof ApiError ? e.message : "Please try again"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => api.post<{ deleted: number }>("/api/v1/hrms/invitations/bulk-delete", { ids }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setSelected(new Set());
      toast.success(`${res.data.deleted} invitation${res.data.deleted === 1 ? "" : "s"} deleted`);
    },
    onError: (e) => toast.error("Bulk delete failed", e instanceof ApiError ? e.message : "Please try again"),
  });

  const bulkMut = useMutation({
    mutationFn: (body: { fileName: string; rows: BulkRow[]; defaultRoleIds: string[] }) =>
      api.post<BulkResult>("/api/v1/hrms/invitations/bulk", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setBulkResult(res.data);
      toast.success(
        "Import processed",
        `${res.data.created} invited, ${res.data.sent} emails sent, ${res.data.skipped.length} skipped.`,
      );
    },
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
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

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
  const filtered = q
    ? invitations.filter((i) =>
        [i.email, i.firstName, i.lastName, [i.firstName, i.lastName].filter(Boolean).join(" "), i.status, ...i.roleNames]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : invitations;

  const filteredUsers = q
    ? users.filter((u) =>
        [u.firstName, u.lastName, u.displayName, u.workEmail, u.jobTitle, u.status, u.role?.name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : users;

  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const someSelected = filtered.some((i) => selected.has(i.id));
  const toggleSelectAll = () =>
    setSelected(() => (allSelected ? new Set() : new Set(filtered.map((i) => i.id))));

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
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Users & Invitations</h1>
          <p className="mt-1 text-sm text-gray-500">Invite people by email and manage pending invitations.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={onBulkDelete}
              disabled={bulkDeleteMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={16} /> {bulkDeleteMut.isPending ? "Deleting…" : `Delete selected (${selected.size})`}
            </button>
          )}
          <button
            onClick={() => { resetBulk(); setShowBulk(true); }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Upload size={16} /> Bulk Import
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <UserPlus size={16} /> Invite User
          </button>
        </div>
      </div>

      <div className="mb-3 relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, role or status…"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          style={{ paddingLeft: "2.25rem" }}
        />
      </div>

      {/* Active users — existing org members (incl. the first Org Admin).
          Mirrors quikscale/quiktrack: the admin who set up the app is always
          visible here, not just pending invitations. */}
      <div className="mb-2 text-[13px] font-semibold text-gray-700">Users</div>
      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-[12px] uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {usersLoading ? (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400">{users.length === 0 ? "No users yet." : "No users match your search."}</td></tr>
            ) : (
              filteredUsers.map((u) => {
                const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
                return (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{name}</div>
                      {u.workEmail && (
                        <div className="flex items-center gap-1 text-[13px] text-gray-500"><Mail size={12} /> {u.workEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.role?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        "inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ring-1",
                        u.status === "Active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-gray-100 text-gray-600 ring-gray-200",
                      )}>{u.status}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-2 text-[13px] font-semibold text-gray-700">Pending Invitations</div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-[12px] uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Roles</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Invited by</th>
              <th className="px-4 py-3 font-semibold">Expires</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{invitations.length === 0 ? "No invitations yet." : "No invitations match your search."}</td></tr>
            ) : (
              filtered.map((inv) => (
                <tr key={inv.id} className={clsx("border-b border-gray-50 last:border-0", selected.has(inv.id) && "bg-blue-50/40")}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {[inv.firstName, inv.lastName].filter(Boolean).join(" ") || "—"}
                    </div>
                    <div className="flex items-center gap-1 text-[13px] text-gray-500">
                      <Mail size={12} /> {inv.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{inv.roleNames.join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ring-1", STATUS_STYLE[inv.status])}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{inv.invitedByName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {(inv.status === "Pending" || inv.status === "Expired") && (
                        <>
                          <button
                            onClick={() => resendMut.mutate(inv.id)}
                            disabled={resendMut.isPending}
                            title="Resend invitation"
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                          >
                            <RotateCw size={13} /> Resend
                          </button>
                          <button
                            onClick={() => onRevoke(inv)}
                            disabled={revokeMut.isPending}
                            title="Revoke invitation"
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[12px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            <Ban size={13} /> Revoke
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => onDelete(inv)}
                        disabled={deleteMut.isPending}
                        title="Delete invitation"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[12px] font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title="Add New User"
        subtitle="Create a user account and grant access to this workspace."
        headerIcon={<UserPlus size={18} />}
        bodyClassName="p-5 overflow-y-auto"
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

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email Address <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com"
              className={inputCls}
            />
            <p className="mt-1.5 text-[12.5px] text-gray-400">
              If this email already belongs to a QuikIT user, they're linked automatically — no duplicate account is created.
            </p>
          </div>

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
                      active ? "border-blue-500 bg-blue-50/40" : "border-gray-200 bg-white hover:bg-gray-50",
                    )}
                  >
                    <div className={clsx("text-[13px] font-semibold", active ? "text-gray-900" : "text-gray-700")}>{m.title}</div>
                    <div className="mt-0.5 text-[12px] leading-snug text-gray-500">{m.desc}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[12.5px] leading-relaxed text-blue-700">
              {form.invitationMethod === "native"
                ? "A temporary QuikIT password is emailed to brand-new users; they set their own on first sign-in. Works for any email."
                : "No password. The user signs in with their Google or Microsoft account via QuikIT. Requires a Google/Microsoft email."}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
            <select
              value={selectedRoleId}
              onChange={(e) => setRole(e.target.value)}
              className={inputCls}
            >
              <option value="">Use org default</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[12.5px] text-gray-400">
              This is their role inside HRMS. In QuikIT they're added as a member.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowInvite(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => inviteMut.mutate(form)}
              disabled={!canSubmit || inviteMut.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={15} /> {inviteMut.isPending ? "Adding…" : "Add User"}
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
        bodyClassName="p-5 overflow-y-auto"
      >
        {bulkResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Invited", value: bulkResult.created, cls: "text-emerald-600" },
                { label: "Sent", value: bulkResult.sent, cls: "text-blue-600" },
                { label: "Skipped", value: bulkResult.skipped.length, cls: "text-amber-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                  <div className={clsx("text-2xl font-bold", s.cls)}>{s.value}</div>
                  <div className="text-[12px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
            {bulkResult.emailFailed > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
                {bulkResult.emailFailed} email(s) could not be sent — check the SMTP settings in .env.local.
              </p>
            )}
            {bulkResult.skipped.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-[13px]">
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
              <button onClick={resetBulk} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">Import another</button>
              <button onClick={() => setShowBulk(false)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2.5 text-[13px] text-blue-700">
              <span>Columns: <strong>email, firstName, lastName, roles</strong> (roles optional).</span>
              <button onClick={downloadTemplate} className="inline-flex items-center gap-1 font-semibold hover:underline">
                <Download size={13} /> Template
              </button>
            </div>

            {bulkRows.length === 0 ? (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
                <FileSpreadsheet size={26} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Click to upload CSV</span>
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
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <FileSpreadsheet size={15} className="text-blue-600" />
                    <span className="font-medium">{bulkFileName}</span>
                    <span className="text-gray-400">· {bulkRows.length} rows</span>
                  </div>
                  <button onClick={() => { setBulkRows([]); setBulkFileName(""); }} className="text-gray-400 hover:text-gray-600" title="Remove">
                    <X size={15} />
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-[13px]">
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
                <p className="text-[13px] text-gray-400">No roles found.</p>
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
                          "rounded-full px-3 py-1 text-[13px] font-medium ring-1 transition",
                          active ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-gray-600 ring-gray-300 hover:bg-gray-50",
                        )}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {bulkError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{bulkError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowBulk(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => bulkMut.mutate({ fileName: bulkFileName, rows: bulkRows, defaultRoleIds: bulkDefaultRoles })}
                disabled={bulkRows.length === 0 || !bulkValid || bulkMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={15} /> {bulkMut.isPending ? "Importing…" : `Import ${bulkRows.length || ""}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
