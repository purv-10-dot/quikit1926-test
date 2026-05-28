"use client";

/**
 * User Management — PDF-spec RBAC (5 roles, no COMPANY_ADMIN).
 *
 * - Lists all user accounts from /api/settings/users
 * - Add / Edit via MasterListPage + FormDrawer
 * - Soft delete (flips status to "inactive")
 * - User Type selector is driven by user-type-map; SUPER_ADMIN is
 *   intentionally NOT in the dropdown (clientSelectable=false).
 * - Module + site assignment fields appear conditionally per the user
 *   type's scope requirements.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserCog, ShieldCheck, Send,
  CheckCircle2, AlertTriangle, Copy, Check, X,
} from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, SelectInput, CheckboxInput,
} from "@/components/FormDrawer";
import {
  useUsers, useCreateUser, useUpdateUser,
} from "@/hooks/use-users";
import { useProjects, useDepartments } from "@/hooks/use-masters";
import {
  USER_TYPES,
  ASSIGNABLE_MODULES,
  getUserTypeDescriptor,
  getClientSelectableUserTypes,
  type UserType,
} from "@/lib/rbac/user-types";
import { mergeModulesWithMatrix } from "@/lib/rbac/menu-catalog";
import { toast } from "@/lib/toast";

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string;
  mobile: string;
  userType: string;
  department?: string;
  modulesAssigned?: string[];
  projectsAssigned?: string[];
  isHoUser?: boolean;
  appAllow?: boolean;
  status: string;
  invitedAt?: string;
  acceptedAt?: string | null;
  inviteTokenExpires?: string | null;
  lastLoginAt?: string | null;
}

const USER_TYPE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  HO_USER: "HO User",
  SITE_ADMIN: "Site Admin",
  USER: "User",
};

const USER_TYPE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-50 text-red-700 border-red-200",
  ADMIN: "bg-purple-50 text-purple-700 border-purple-200",
  HO_USER: "bg-orange-50 text-orange-700 border-orange-200",
  SITE_ADMIN: "bg-green-50 text-green-700 border-green-200",
  USER: "bg-gray-50 text-gray-700 border-gray-200",
};

const emptyForm = {
  username: "",
  fullName: "",
  email: "",
  mobile: "",
  userType: "USER" as UserType,
  modulesAssigned: [] as string[],
  projectsAssigned: [] as string[],
  department: "",
  isHoUser: false,
  appAllow: true,
  password: "",
  retypePassword: "",
  status: "active",
};

interface InviteResult {
  email: string;
  fullName?: string;
  url: string;
  mailSent: boolean;
  mailError?: string;
  mode: "create" | "resend";
}

function InviteResultDialog({
  result,
  onClose,
}: {
  result: InviteResult | null;
  onClose: () => void;
}) {
  // Brief "just copied" flag — drives the Copy → Check icon swap.
  // Cleared automatically after COPIED_FLASH_MS, and also reset every
  // time the dialog is reopened with a new result.
  const [copied, setCopied] = useState(false);
  const COPIED_FLASH_MS = 1500;

  // Esc-to-close + body scroll lock while open
  useEffect(() => {
    if (!result) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [result, onClose]);

  // Reset the copied flash whenever the dialog is opened for a new
  // invite result — stops a stale "Copied" tick from the previous open.
  useEffect(() => { setCopied(false); }, [result]);

  // Run the auto-revert timer only while the flag is set, so we don't
  // schedule a no-op timeout on every re-render.
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), COPIED_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (!result) return null;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard blocked — select and copy manually");
    }
  };

  const sent = result.mailSent;
  const headerIcon = sent
    ? <CheckCircle2 className="w-5 h-5" />
    : <AlertTriangle className="w-5 h-5" />;
  const headerTone = sent
    ? "bg-green-50 text-green-600"
    : "bg-amber-50 text-amber-600";
  const title = sent
    ? (result.mode === "resend" ? "Invite resent" : "Invite sent")
    : "Email could not be delivered";
  const subtitle = sent
    ? <>An invitation email has been sent to <span className="font-medium text-gray-800">{result.email}</span>.</>
    : <>The user record was created, but the email failed. Share the invite link below manually.</>;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-start gap-4 px-6 py-5 border-b border-gray-100">
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${headerTone}`}>
            {headerIcon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <div className="text-sm text-gray-600 mt-1 leading-relaxed">{subtitle}</div>
            {!sent && result.mailError && (
              <div className="mt-2 text-[11px] font-mono text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 break-all">
                {result.mailError}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 rounded-md text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Invite link
            </div>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 truncate text-gray-700">
                {result.url}
              </div>
              <button
                type="button"
                onClick={() => copy(result.url, "Invite link")}
                aria-label={copied ? "Invite link copied" : "Copy invite link"}
                className={
                  copied
                    ? "inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Expires in 72 hours. The user lands on the login page with their email pre-filled.
            </div>
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const { data: result, isLoading } = useUsers();
  const { data: projectsResult } = useProjects();
  const { data: deptsResult } = useDepartments();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // userIds whose resend request is currently in flight. Used to drop
  // fat-finger double-clicks during the round-trip; the server-side
  // token-expiry check is the authoritative guard.
  const [resendingIds, setResendingIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(emptyForm);
  // Result of the most recent create/resend invite call. When set, the
  // InviteResultDialog renders with the invite URL so the admin can
  // capture it before dismissing. Replaces the native `alert()` that
  // used to carry this payload.
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const set = (key: keyof typeof emptyForm, val: any) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  // Catalog of role + project + department options
  const userTypeOptions = useMemo(
    () =>
      getClientSelectableUserTypes().map((t) => ({
        value: t.key,
        label: t.label,
      })),
    []
  );
  // Hide soft-deleted projects from the site-assignment picker so a user
  // can't be assigned to a project that no longer exists on the list page.
  const projects = (projectsResult?.data ?? []).filter(
    (p: any) => p?.status !== "inactive",
  );
  const departments = deptsResult?.data ?? [];
  const deptOptions = departments.map((d: any) => ({
    value: d.name,
    label: d.name,
  }));

  // Scope flags for the currently-selected user type
  const descriptor = getUserTypeDescriptor(form.userType);
  const needsModules = descriptor?.requiresModuleAssignment ?? false;
  const needsSites = descriptor?.requiresSiteAssignment ?? false;
  // ADMIN inherently has every module — surface the picker as fully-checked
  // and read-only so the admin-on-screen sees the implication explicitly
  // instead of an empty "?" gap.
  const isAdminAllModules = form.userType === USER_TYPES.ADMIN;
  const allModuleKeys = ASSIGNABLE_MODULES.map((m) => m.key);

  const toggleModule = (moduleKey: string) => {
    setForm((prev) => ({
      ...prev,
      modulesAssigned: prev.modulesAssigned.includes(moduleKey)
        ? prev.modulesAssigned.filter((m) => m !== moduleKey)
        : [...prev.modulesAssigned, moduleKey],
    }));
  };

  const toggleProject = (projectId: string) => {
    setForm((prev) => ({
      ...prev,
      projectsAssigned: prev.projectsAssigned.includes(projectId)
        ? prev.projectsAssigned.filter((p) => p !== projectId)
        : [...prev.projectsAssigned, projectId],
    }));
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async () => {
    if (!form.username) { toast.error("Username is required"); return; }
    if (!form.fullName) { toast.error("Full Name is required"); return; }
    if (!form.email) { toast.error("Email is required"); return; }
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile)) {
      toast.error("Mobile must be 10 digits starting with 6, 7, 8, or 9");
      return;
    }
    if (needsSites && form.projectsAssigned.length === 0) {
      toast.error("Select at least one project / site for this user");
      return;
    }
    if (needsModules && form.modulesAssigned.length === 0) {
      toast.error("Select at least one module for this user");
      return;
    }

    // Don't ship passwords here — new users set their own via the
    // emailed invite link; existing users hit password reset (Phase 2).
    const { password: _p, retypePassword: _rp, ...payload } = form;

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
      } else {
        const res: any = await createMutation.mutateAsync(payload);
        const inviteUrl = res?.invite?.url;
        const mailSent = !!res?.invite?.mail?.sent;
        const mailError = res?.invite?.mail?.error;
        if (inviteUrl) {
          // Pre-copy so the admin can paste straight away even if they
          // dismiss without hitting the Copy button. Non-fatal if blocked.
          try { await navigator.clipboard.writeText(inviteUrl); } catch { /* ignore */ }
          setInviteResult({
            email: res.email,
            fullName: res.fullName,
            url: inviteUrl,
            mailSent,
            mailError,
            mode: "create",
          });
        }
      }
      closeDrawer();
    } catch { /* error toast handled globally */ }
  };

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const handleRestore = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "active" });
  };

  const handleResendInvite = async (item: any) => {
    if (resendingIds.has(item.id)) return;
    setResendingIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    try {
      const res = await fetch(`/api/settings/users/${item.id}/resend-invite`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to resend invite");
      const inviteUrl = json?.invite?.url;
      const mailSent = !!json?.invite?.mail?.sent;
      const mailError = json?.invite?.mail?.error;
      if (inviteUrl) {
        try { await navigator.clipboard.writeText(inviteUrl); } catch { /* ignore */ }
        // Blocking dialog — the URL must be captured before dismissing.
        // Temp password is intentionally omitted on resend: the server
        // doesn't return a fresh one and the old one still works.
        setInviteResult({
          email: item.email,
          fullName: item.fullName,
          url: inviteUrl,
          mailSent,
          mailError,
          mode: "resend",
        });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to resend invite");
    } finally {
      setResendingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    // Modules are shown as ticked when EITHER explicitly assigned on the
    // user record OR granted through a row in the permission matrix. The
    // server keeps these in sync on save, but deriving again here means
    // the drawer reflects the matrix instantly even if the row hasn't
    // been re-fetched yet (optimistic consistency).
    const assigned = Array.isArray(item.modulesAssigned)
      ? item.modulesAssigned
      : [];
    const matrix =
      item.permissionMatrix && typeof item.permissionMatrix === "object"
        ? item.permissionMatrix
        : null;
    // ADMIN is implicitly all-modules — tick every module on the form
    // so the picker shows the truth even if the DB row doesn't list them
    // explicitly (the descriptor sets requiresModuleAssignment=false, so
    // older rows may have been saved with an empty modulesAssigned).
    const isAdmin = item.userType === USER_TYPES.ADMIN;
    setForm({
      username: item.username ?? "",
      fullName: item.fullName ?? "",
      email: item.email ?? "",
      mobile: item.mobile ?? "",
      userType: (item.userType ?? "USER") as UserType,
      modulesAssigned: isAdmin
        ? ASSIGNABLE_MODULES.map((m) => m.key)
        : mergeModulesWithMatrix(assigned, matrix),
      projectsAssigned: Array.isArray(item.projectsAssigned) ? item.projectsAssigned : [],
      department: item.department ?? "",
      isHoUser: !!item.isHoUser,
      appAllow: item.appAllow !== false,
      password: "",
      retypePassword: "",
      status: item.status ?? "active",
    });
    setDrawerOpen(true);
  };

  const columns: MasterColumnDef<UserRow>[] = useMemo(
    () => [
      {
        key: "fullName",
        label: "Name",
        render: (row) => (
          <div>
            <div className="font-medium text-gray-900">{row.fullName}</div>
            <div className="text-[10px] text-gray-500 font-mono">@{row.username}</div>
          </div>
        ),
      },
      { key: "email", label: "Email" },
      { key: "mobile", label: "Mobile", width: "120px" },
      {
        key: "userType",
        label: "User Type",
        width: "150px",
        render: (row) => (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
              USER_TYPE_COLORS[row.userType] ?? "bg-gray-50 text-gray-700 border-gray-200"
            }`}
          >
            {USER_TYPE_LABELS[row.userType] ?? row.userType}
          </span>
        ),
      },
      { key: "department", label: "Department" },
      {
        key: "projectsAssigned",
        label: "Sites",
        width: "80px",
        render: (row) => {
          const d = getUserTypeDescriptor(row.userType);
          if (d?.crossSite) return <span className="text-[10px] text-gray-500">All sites</span>;
          const n = row.projectsAssigned?.length ?? 0;
          return <span className="text-xs text-gray-700">{n}</span>;
        },
      },
      {
        key: "status",
        label: "Status",
        width: "140px",
        render: (row) => {
          const isInactive = row.status === "inactive";
          // A non-null lastLoginAt also counts as acceptance — covers users
          // who logged in before the touchLastLogin auto-accept landed and
          // whose acceptedAt was therefore never stamped.
          const accepted = !!row.acceptedAt || !!row.lastLoginAt;
          const inviteOpen = !accepted && !!row.inviteTokenExpires;
          const inviteExpired =
            inviteOpen &&
            new Date(row.inviteTokenExpires as string).getTime() < Date.now();
          if (isInactive) {
            return (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-gray-50 text-gray-500 border-gray-200">
                Inactive
              </span>
            );
          }
          if (inviteExpired) {
            return (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-red-50 text-red-700 border-red-200"
                title="Invite link expired — resend to issue a new one"
              >
                Invite Expired
              </span>
            );
          }
          if (inviteOpen) {
            return (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200"
                title="Invite sent — waiting for the user to set their password"
              >
                Invite Pending
              </span>
            );
          }
          return (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-green-50 text-green-700 border-green-200">
              Active
            </span>
          );
        },
      },
      {
        key: "__rights",
        label: "Actions",
        width: "200px",
        sortable: false,
        render: (row) => {
          const accepted = !!row.acceptedAt || !!row.lastLoginAt;
          const isInvited = !accepted && !!row.inviteTokenExpires;
          // Resend is only meaningful once the 72h invite token has elapsed.
          // While the existing link is still valid, the button stays
          // visible but disabled so admins can see *why* they can't resend
          // (tooltip carries the expiry date) instead of the button just
          // vanishing.
          const expiresAtMs = row.inviteTokenExpires
            ? new Date(row.inviteTokenExpires).getTime()
            : 0;
          const inviteExpired = isInvited && expiresAtMs <= Date.now();
          const sending = resendingIds.has(row.id);
          const canResend = isInvited && inviteExpired && !sending;
          // Coarse-grained countdown surfaced in the disabled button label so
          // the admin doesn't have to hover to learn when resend unlocks.
          // 72h windows don't warrant a ticking timer, so this is computed
          // at render time only — refreshes whenever the list re-fetches.
          const remainingMs = Math.max(0, expiresAtMs - Date.now());
          const remainingLabel = (() => {
            if (remainingMs <= 0) return "";
            const totalMin = Math.ceil(remainingMs / 60_000);
            if (totalMin < 60) return `${totalMin}m`;
            const hours = Math.ceil(totalMin / 60);
            return `${hours}h`;
          })();
          const resendTooltip = sending
            ? "Sending invitation email…"
            : inviteExpired
              ? "Issue a fresh invite (current one has expired)"
              : `Resend unlocks after the current invite expires on ${new Date(expiresAtMs).toLocaleString()}. The current invite remains valid for 72 hours from when it was sent.`;
          return (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/settings/users/${row.id}/permissions`);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 hover:underline"
                title="Configure per-menu Add/Edit/Delete/View permissions"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Permissions
              </button>
              {isInvited && (
                <button
                  type="button"
                  disabled={!canResend}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResendInvite(row);
                  }}
                  className={
                    canResend
                      ? "inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 hover:underline"
                      : "inline-flex items-center gap-1 text-xs font-medium text-gray-400 cursor-not-allowed"
                  }
                  title={resendTooltip}
                >
                  <Send className="w-3.5 h-3.5" />
                  {sending
                    ? "Sending…"
                    : canResend
                      ? "Resend"
                      : `Resend · unlocks in ${remainingLabel}`}
                </button>
              )}
            </div>
          );
        },
      },
    ],
    // resendingIds is read inside the Actions cell render, so its changes
    // must invalidate the memo — otherwise the in-flight "Sending…" label
    // wouldn't appear until some unrelated render kicked the table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, resendingIds]
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage
        title="User Management"
        entityName="User"
        columns={columns}
        data={result?.data ?? []}
        total={result?.total ?? 0}
        isLoading={isLoading}
        showStatusTabs
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users" }]}
        onAdd={() => {
          setForm(emptyForm);
          setEditingId(null);
          setDrawerOpen(true);
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRestore={handleRestore}
        deleteConfirmMessage={(item: any) => (
          <>
            Deactivate user{" "}
            <span className="font-semibold text-gray-900">“{item.fullName}”</span>
            {item.username ? <> (<span className="font-mono">@{item.username}</span>)</> : null}?
            <br />
            The account will be marked inactive and hidden from login. You can
            re-activate it via Edit.
          </>
        )}
        emptyIcon={<UserCog className="w-8 h-8" />}
        emptyDescription="Add users and assign roles, departments, and project access."
      />

      <FormDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingId ? "Edit User" : "Add User"}
        subtitle={
          editingId
            ? "Update profile, role, and access scope"
            : "Configure user details, role, and access scope"
        }
        width="xl"
        onSubmit={handleSubmit}
        loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Create User"}
      >
        <FormSection title="Basic Information">
          <FormRow>
            <Field label="Username" required hint={editingId ? "Cannot be changed after creation" : undefined}>
              <TextInput
                value={form.username}
                onChange={(v) => set("username", v)}
                placeholder="e.g. jdoe"
                disabled={!!editingId}
              />
            </Field>
            <Field label="Full Name" required>
              <TextInput
                value={form.fullName}
                onChange={(v) => set("fullName", v)}
                placeholder="John Doe"
              />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Email ID" required>
              <TextInput
                value={form.email}
                onChange={(v) => set("email", v)}
                type="email"
                placeholder="john@company.com"
              />
            </Field>
            <Field
              label="Mobile No."
              hint="10-digit Indian mobile (starts with 6–9)"
              error={
                form.mobile && !/^[6-9]\d{9}$/.test(form.mobile)
                  ? "Enter a valid 10-digit Indian mobile"
                  : undefined
              }
            >
              <TextInput
                value={form.mobile}
                onChange={(v) => set("mobile", v.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543210"
                maxLength={10}
                invalid={!!(form.mobile && !/^[6-9]\d{9}$/.test(form.mobile))}
              />
            </Field>
          </FormRow>
          <Field label="Department">
            <SelectInput
              value={form.department}
              onChange={(v) => set("department", v)}
              options={deptOptions}
              placeholder="Select department"
            />
          </Field>
        </FormSection>

        {/* New users set their own password via the invite email link,
            so the Add form doesn't ask the admin to choose one. Edits
            don't touch passwords either — use the resend-invite flow or
            a dedicated password reset (Phase 2). */}
        {!editingId && (
          <FormSection title="Invitation">
            <div className="text-xs text-gray-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 leading-relaxed">
              When you click <span className="font-semibold">Create User</span>, an
              invitation email with a one-time setup link will be sent to{" "}
              <span className="font-mono">{form.email || "the user's email"}</span>.
              The link expires in 72 hours. You&apos;ll also get a copy of the invite URL
              in case you need to share it manually.
            </div>
          </FormSection>
        )}

        <FormSection title="Role & Scope">
          <Field
            label="User Type"
            required
            hint="Controls what the user can see and do. Super Admin is MoreYeahs-only."
          >
            <SelectInput
              value={form.userType}
              onChange={(v) => {
                set("userType", v);
                // Clear scope fields when switching role so leftover state
                // from the previous role doesn't persist. ADMIN is the
                // exception — it implicitly owns every module, so we tick
                // them all on the user record so the saved payload matches
                // what the UI shows.
                const d = getUserTypeDescriptor(v);
                if (v === USER_TYPES.ADMIN) {
                  set("modulesAssigned", allModuleKeys);
                } else if (!d?.requiresModuleAssignment) {
                  set("modulesAssigned", []);
                }
                if (!d?.requiresSiteAssignment) set("projectsAssigned", []);
              }}
              options={userTypeOptions}
            />
          </Field>

          {descriptor && (
            <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-relaxed space-y-1">
              <div>{descriptor.shortDescription}</div>
              {!descriptor.requiresModuleAssignment && descriptor.key !== "SUPER_ADMIN" && (
                <div className="text-amber-700">
                  <b>Note:</b> This role has access to <b>all modules</b> by design.
                  To restrict a user to specific modules (e.g. Purchase + Store only),
                  choose <b>User (Specific sites + modules)</b> instead.
                </div>
              )}
            </div>
          )}

          {needsSites && (
            <Field
              label="Project / Site Assignment"
              required
              hint="User can only see and act on the sites ticked below"
            >
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                {projects.length === 0 && (
                  <div className="text-xs text-gray-400 italic px-3 py-2">
                    No projects found. Create projects under Masters → Projects first.
                  </div>
                )}
                {projects.map((p: any) => {
                  const checked = form.projectsAssigned.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProject(p.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-sm text-gray-700 flex-1">{p.name}</span>
                      {p.code && (
                        <span className="text-[10px] font-mono text-gray-400">{p.code}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </Field>
          )}

          {(needsModules || isAdminAllModules) && (
            <Field
              label="Modules (Multiple)"
              required={needsModules}
              hint={
                isAdminAllModules
                  ? "Admin has access to all modules — selection is locked."
                  : "User can only access the modules ticked below"
              }
            >
              <div className="grid grid-cols-2 gap-2">
                {ASSIGNABLE_MODULES.map((m) => {
                  const checked = isAdminAllModules
                    ? true
                    : form.modulesAssigned.includes(m.key);
                  return (
                    <label
                      key={m.key}
                      className={`flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg ${
                        isAdminAllModules
                          ? "bg-gray-50 cursor-not-allowed"
                          : "cursor-pointer hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isAdminAllModules}
                        onChange={() => {
                          if (!isAdminAllModules) toggleModule(m.key);
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 disabled:opacity-100"
                      />
                      <span className="text-sm text-gray-700">{m.label}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
          )}

          <div className="flex gap-6 mt-1">
            <CheckboxInput
              checked={form.appAllow}
              onChange={(v) => set("appAllow", v)}
              label="Allow Mobile App Access"
            />
          </div>
        </FormSection>
      </FormDrawer>

      <InviteResultDialog
        result={inviteResult}
        onClose={() => setInviteResult(null)}
      />
    </>
  );
}
