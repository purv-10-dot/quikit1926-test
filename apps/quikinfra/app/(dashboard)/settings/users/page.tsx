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

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserCog, Send, ShieldCheck,
  CheckCircle2, AlertTriangle, Copy, Check, X,
} from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, SelectInput, CheckboxInput,
} from "@/components/FormDrawer";
import {
  useUsers, useCreateUser, useUpdateUser, useRoles,
} from "@/hooks/use-users";
import { useProjects, useDepartments } from "@/hooks/use-masters";
import {
  ASSIGNABLE_MODULES,
  getDescriptorByRoleName,
  formatRoleLabel,
} from "@/lib/rbac/user-types";
import { mergeModulesWithMatrix, type PermissionMatrix } from "@/lib/rbac/menu-catalog";
import { toast } from "@/lib/toast";

interface UserRow {
  id: string;
  username: string;            // legacy column on cn_users; derived server-side from email
  fullName: string;            // legacy column on cn_users; kept for back-compat in list responses
  firstName?: string;          // preferred field — populated for new invites
  lastName?: string;           // preferred field — populated for new invites
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
  roleKey?: string;
  permissionMatrix?: PermissionMatrix | null;
  hasSettingsAccess?: boolean;
}

/* ─── Email-typeahead hit (existing org member) ─── */
interface ExistingMemberHit {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
  status: string;
  hasQuikInfraAccess: boolean;
}

function memberInitials(first?: string | null, last?: string | null) {
  return (`${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?");
}

function memberAvatarColor(name: string) {
  const colors = [
    "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
    "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-indigo-500",
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

const USER_TYPE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-50 text-red-700 border-red-200",
  ADMIN: "bg-purple-50 text-purple-700 border-purple-200",
  HO_USER: "bg-orange-50 text-orange-700 border-orange-200",
  SITE_ADMIN: "bg-green-50 text-green-700 border-green-200",
  USER: "bg-gray-50 text-gray-700 border-gray-200",
};

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  mobile: "",
  userType: "user",
  modulesAssigned: [] as string[],
  projectsAssigned: [] as string[],
  department: "",
  isHoUser: false,
  appAllow: true,
  password: "",
  retypePassword: "",
  status: "active",
  // When userType === "ADMIN" (company_admin), this checkbox controls
  // whether the user also gets access to the Settings module. Default
  // unchecked = sub-admins can't invite / manage roles, blocking the
  // "admin sprawl" loophole. Wired to /api/settings/users (invite) and
  // /api/org/users/[id]/role (role swap) as `enableSettings`.
  enableSettings: false,
  // How the invitee signs in. Default = native (temporary password
  // emailed). SSO is for orgs that have Google / Microsoft workspace SSO
  // configured at the central auth level — the invitee then signs in
  // with their existing provider, no password needed.
  invitationMethod: "native" as "native" | "sso",
  // Set when the admin picks an existing org member from the email
  // typeahead. Switches the create call to the "link existing user →
  // grant QuikInfra access" path: no new account, no invite email.
  linkExistingUserId: null as string | null,
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
              <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 break-all">
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
              <div className="flex-1 min-w-0 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 truncate text-gray-700">
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
  const { data: result, isLoading } = useUsers();
  const { data: projectsResult } = useProjects();
  const { data: deptsResult } = useDepartments();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();

  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The email the record had when the Edit drawer opened. Used to detect an
  // actual email change so we only validate + send `email` when it differs —
  // legacy rows with a malformed email stay editable for their other fields.
  const [originalEmail, setOriginalEmail] = useState("");
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
  const set = (key: keyof typeof emptyForm, val: string | string[] | boolean | null) =>
    setForm((prev) => ({ ...prev, [key]: val }) as typeof emptyForm);

  // ── Email typeahead (link existing org member) ──────────────────────
  // When the admin types an email in CREATE mode, debounce a search against
  // /api/settings/users/search. Hits are existing OrgMembers of this org —
  // they may already belong via QuikScale / QuikTrack / etc. and just need a
  // UserAppAccess row for QuikInfra. Mirrors QuikScale's Add User panel.
  const [emailSuggestions, setEmailSuggestions] = useState<ExistingMemberHit[]>([]);
  const [emailDropOpen, setEmailDropOpen] = useState(false);
  const [emailSearching, setEmailSearching] = useState(false);
  const [emailSearchError, setEmailSearchError] = useState<string | null>(null);
  const emailBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingId) return;            // Edit mode: email is locked
    if (form.linkExistingUserId) return; // already linked — stop searching
    const q = form.email.trim();
    if (q.length < 2) {
      setEmailSuggestions([]);
      setEmailSearching(false);
      setEmailSearchError(null);
      return;
    }
    // Cancel any in-flight request when the query changes so a slow earlier
    // response can't overwrite a newer one (the endpoint can take seconds).
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setEmailSearching(true);
      setEmailSearchError(null);
      setEmailDropOpen(true); // open immediately so the user sees progress
      try {
        const res = await fetch(
          `/api/settings/users/search?email=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        const json = await res.json();
        if (json.success) {
          setEmailSuggestions(json.data as ExistingMemberHit[]);
        } else {
          setEmailSuggestions([]);
          setEmailSearchError(json.error ?? "Search failed");
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setEmailSuggestions([]);
        setEmailSearchError("Search failed — check your connection");
      } finally {
        setEmailSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [form.email, form.linkExistingUserId, editingId]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (emailBoxRef.current && !emailBoxRef.current.contains(e.target as Node))
        setEmailDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const pickExisting = (hit: ExistingMemberHit) => {
    setForm((p) => ({
      ...p,
      firstName: hit.firstName ?? "",
      lastName: hit.lastName ?? "",
      email: hit.email,
      linkExistingUserId: hit.userId,
    }));
    setEmailDropOpen(false);
  };

  const clearLink = () =>
    setForm((p) => ({ ...p, firstName: "", lastName: "", email: "", linkExistingUserId: null }));

  // Catalog of role + project + department options — driven by the
  // dynamic /api/org/roles endpoint so any custom role created in
  // Settings → Roles shows up automatically. System roles (admin /
  // ho_user / site_admin / user) are listed first; custom roles after.
  const { data: rolesResult } = useRoles();
  const userTypeOptions = useMemo(() => {
    const roles = rolesResult?.data ?? [];
    const sorted = [...roles].sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted.map((r) => ({
      value: r.name,
      label: formatRoleLabel(r.name),
    }));
  }, [rolesResult]);
  // Hide soft-deleted projects from the site-assignment picker so a user
  // can't be assigned to a project that no longer exists on the list page.
  const projects = (projectsResult?.data ?? []).filter(
    (p) => p?.status !== "inactive",
  );
  // Only active departments are selectable — inactive (paused) and deleted
  // ones must not appear in the picker. Deleted rows are already excluded by
  // the API; this also drops the inactive ones.
  const allDepartments = deptsResult?.data ?? [];
  const departments = allDepartments.filter((d) => d?.status === "active");
  const deptOptions = departments.map((d) => ({
    value: d.name,
    label: d.name,
  }));

  // Stale-assignment handling: if the user is already assigned to a department
  // that is no longer active, keep showing it (tagged) instead of silently
  // blanking the field — so a careless save can't wipe the assignment. The API
  // returns active + inactive rows (deleted are excluded), so a name still
  // present in the list but not active is "inactive"; a name absent entirely is
  // "unavailable" (deleted/removed).
  const assignedDept = (form.department ?? "").trim();
  const assignedIsActive = deptOptions.some((o) => o.value === assignedDept);
  const assignedIsInactive =
    !!assignedDept &&
    !assignedIsActive &&
    allDepartments.some((d) => d.name === assignedDept);
  const assignedIsMissing =
    !!assignedDept && !assignedIsActive && !assignedIsInactive;
  const staleDeptNotice = assignedIsInactive
    ? "This department is inactive — select another to reassign."
    : assignedIsMissing
      ? "This department no longer exists — select another to reassign."
      : null;
  const effectiveDeptOptions =
    assignedDept && !assignedIsActive
      ? [
          ...deptOptions,
          {
            value: assignedDept,
            label: `${assignedDept} (${assignedIsInactive ? "inactive" : "unavailable"})`,
          },
        ]
      : deptOptions;

  // Scope flags for the currently-selected role
  const descriptor = getDescriptorByRoleName(form.userType);
  const needsModules = descriptor.requiresModuleAssignment;
  const needsSites = descriptor.requiresSiteAssignment;
  // ADMIN inherently has every module — surface the picker as fully-checked
  // and read-only so the admin-on-screen sees the implication explicitly
  // instead of an empty "?" gap.
  const isAdminAllModules = (form.userType ?? "").toLowerCase() === "admin";

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
    setOriginalEmail("");
    setForm(emptyForm);
    setEmailSuggestions([]);
    setEmailDropOpen(false);
    setEmailSearching(false);
    setEmailSearchError(null);
  };

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { toast.error("First Name is required"); return; }
    if (!form.lastName.trim())  { toast.error("Last Name is required");  return; }
    if (!form.email) { toast.error("Email is required"); return; }
    // An email is "changed" on edit when it differs (case-insensitively)
    // from what the record had when the drawer opened. On create it's
    // always considered changed. We only validate the format when it
    // changed, so an admin fixing other fields on a legacy record whose
    // email predates this check isn't trapped.
    const emailChanged =
      !editingId ||
      form.email.trim().toLowerCase() !== originalEmail.trim().toLowerCase();
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }
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
    // Only send `email` when it actually changed on edit — keeps the server
    // from re-validating (and potentially rejecting) an unchanged legacy
    // email, and avoids a no-op write to auth.User.
    if (editingId && !emailChanged) {
      delete (payload as Partial<typeof payload>).email;
    }

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
      } else {
        const res = (await createMutation.mutateAsync(payload)) as {
          invite?: { url?: string; mail?: { sent?: boolean; error?: string } };
          email?: string;
          fullName?: string;
        };
        const inviteUrl = res?.invite?.url;
        const mailSent = !!res?.invite?.mail?.sent;
        const mailError = res?.invite?.mail?.error;
        if (inviteUrl) {
          // Pre-copy so the admin can paste straight away even if they
          // dismiss without hitting the Copy button. Non-fatal if blocked.
          try { await navigator.clipboard.writeText(inviteUrl); } catch { /* ignore */ }
          setInviteResult({
            email: res.email ?? "",
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

  const handleDelete = async (item: UserRow) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const handleRestore = async (item: UserRow) => {
    await updateMutation.mutateAsync({ id: item.id, status: "active" });
  };

  const handleResendInvite = async (item: UserRow) => {
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
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Failed to resend invite"));
    } finally {
      setResendingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleEdit = (item: UserRow) => {
    setEditingId(item.id);
    setOriginalEmail(item.email ?? "");
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
    const roleName = (item.roleKey ?? item.userType ?? "user").toLowerCase();
    const isAdmin = roleName === "admin";
    // Source the new firstName/lastName from the row if present; otherwise
    // fall back to splitting the legacy fullName on the first whitespace.
    // The list endpoint will start returning firstName/lastName once the
    // central CnUserProfile is the source of truth (Phase 2).
    const legacyFull = String(item.fullName ?? "").trim();
    const [legacyFirst, ...legacyRest] = legacyFull.split(/\s+/).filter(Boolean);
    setForm({
      firstName: item.firstName ?? legacyFirst ?? "",
      lastName:  item.lastName  ?? legacyRest.join(" ") ?? "",
      email: item.email ?? "",
      mobile: item.mobile ?? "",
      userType: roleName,
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
      // The list endpoint may surface a `hasSettingsAccess` flag (true
      // when the user has the 4 settings-related UserPermissionExtra
      // rows). Default to false — the API treats omission the same way.
      enableSettings: !!item.hasSettingsAccess,
      // Invitation method only applies to NEW users (the section is
      // hidden in the edit drawer), but reset to the default so the
      // value doesn't bleed across an Add → Edit sequence.
      invitationMethod: "native",
      // Edit mode never links — email is locked to the existing record.
      linkExistingUserId: null,
    });
    setDrawerOpen(true);
  };

  const columns: MasterColumnDef<UserRow>[] = useMemo(
    () => [
      {
        key: "fullName",
        label: "Name",
        render: (row) => {
          const displayName =
            row.firstName || row.lastName
              ? [row.firstName, row.lastName].filter(Boolean).join(" ")
              : row.fullName;
          return <div className="font-medium text-gray-900">{displayName}</div>;
        },
      },
      { key: "email", label: "Email" },
      {
        key: "userType",
        label: "Role",
        width: "210px",
        render: (row) => {
          // Prefer the lowercase `roleKey` from the API (matches CnAppRole.name).
          // Fall back to the legacy uppercase `userType` for older payloads.
          const roleName = (row.roleKey ?? row.userType ?? "").toString();
          const upperKey = roleName.toUpperCase().replace(/-/g, "_");
          const color =
            USER_TYPE_COLORS[upperKey] ?? "bg-gray-50 text-gray-700 border-gray-200";
          // Only the admin role can hold the optional "Grant Settings access"
          // extra. When present, show a second badge so it's visible at a
          // glance which admins can reach Settings (invite users / manage
          // roles) vs plain app-only admins.
          const showSettingsBadge =
            roleName.toLowerCase() === "admin" && !!row.hasSettingsAccess;
          return (
            <div className="flex flex-col items-start gap-1">
              <span
                className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md border ${color}`}
              >
                {formatRoleLabel(roleName)}
              </span>
              {showSettingsBadge && (
                <span
                  className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"
                  title="Can invite users, manage roles, and reach the Settings module"
                >
                  <ShieldCheck className="h-3 w-3 shrink-0" />
                  Settings module access
                </span>
              )}
            </div>
          );
        },
      },
      { key: "department", label: "Department" },
      {
        key: "projectsAssigned",
        label: "Sites",
        width: "80px",
        render: (row) => {
          const roleName = (row.roleKey ?? row.userType ?? "").toString();
          const d = getDescriptorByRoleName(roleName);
          if (d.crossSite) return <span className="text-[10px] text-gray-500">All sites</span>;
          const n = row.projectsAssigned?.length ?? 0;
          return <span className="text-xs text-gray-700">{n}</span>;
        },
      },
      {
        key: "status",
        label: "Status",
        width: "180px",
        render: (row) => {
          const isInactive = row.status === "inactive";
          // Either signal counts as "accepted":
          //   acceptedAt   — quikit.OrgMember.acceptedAt, set when the
          //                  launcher's set-password flow completes
          //   lastLoginAt  — auth.User.lastSignInAt, set on every sign-in
          // The list endpoint overrides both with their v2 sources.
          const accepted = !!row.acceptedAt || !!row.lastLoginAt;
          const inviteOpen = !accepted && !!row.inviteTokenExpires;
          const expiresAtMs = row.inviteTokenExpires
            ? new Date(row.inviteTokenExpires).getTime()
            : 0;
          const inviteExpired = inviteOpen && expiresAtMs < Date.now();
          const sending = resendingIds.has(row.id);

          // Common wrapper — every variant returns the same flex
          // structure so the pill is always anchored to the same
          // top-left position, regardless of whether the variant adds
          // a secondary line (Resend countdown / Resend button).
          // Without this, Active/Inactive rows render as bare <span>s
          // and visually drift up/down relative to the multi-line
          // Invite Pending row.
          const PILL_BASE =
            "self-start text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap";

          if (isInactive) {
            return (
              <div className="flex flex-col items-start gap-0.5">
                <span className={`${PILL_BASE} bg-gray-50 text-gray-500 border-gray-200`}>
                  Inactive
                </span>
              </div>
            );
          }
          if (inviteExpired) {
            // Expired invites get an inline Resend action — sits BELOW
            // the pill (matches the Pending layout), not beside it, so
            // every multi-line variant has the same vertical rhythm.
            return (
              <div className="flex flex-col items-start gap-0.5">
                <span
                  className={`${PILL_BASE} bg-red-50 text-red-700 border-red-200`}
                  title="Invite link expired — resend to issue a new one"
                >
                  Invite Expired
                </span>
                <button
                  type="button"
                  disabled={sending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResendInvite(row);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-700 hover:text-orange-900 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline"
                  title="Send a fresh invite email"
                >
                  <Send className="w-3 h-3" />
                  {sending ? "Sending…" : "Resend"}
                </button>
              </div>
            );
          }
          if (inviteOpen) {
            const remainingMs = Math.max(0, expiresAtMs - Date.now());
            const remainingLabel = (() => {
              if (remainingMs <= 0) return "";
              const totalMin = Math.ceil(remainingMs / 60_000);
              if (totalMin < 60) return `${totalMin}m`;
              const hours = Math.ceil(totalMin / 60);
              return `${hours}h`;
            })();
            return (
              <div className="flex flex-col items-start gap-0.5">
                <span
                  className={`${PILL_BASE} bg-amber-50 text-amber-700 border-amber-200`}
                  title="Invite sent — waiting for the user to set their password"
                >
                  Invite Pending
                </span>
                {remainingLabel && (
                  <span className="text-[10px] text-gray-400">
                    Resend in {remainingLabel}
                  </span>
                )}
              </div>
            );
          }
          return (
            <div className="flex flex-col items-start gap-0.5">
              <span className={`${PILL_BASE} bg-green-50 text-green-700 border-green-200`}>
                Active
              </span>
            </div>
          );
        },
      },
      {
        key: "__permissions",
        label: "Permissions",
        width: "120px",
        sortable: false,
        render: (row) => (
          // Cell-level permission overrides live on a dedicated full-
          // width page (the matrix is too wide for the row-actions
          // column). Role + modules already grant the typical case at
          // invite time; this link is for the rare per-cell override.
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
        ),
      },
    ],
    // resendingIds is read inside the Status cell render (the inline
    // Resend button), so its changes must invalidate the memo —
    // otherwise the in-flight "Sending…" label wouldn't appear until
    // some unrelated render kicked the table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resendingIds, router]
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage
        title="User Management"
        entityName="User"
        columns={columns}
        data={(result?.data ?? []) as UserRow[]}
        total={result?.total ?? 0}
        isLoading={isLoading}
        showStatusTabs
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users" }]}
        onAdd={() => {
          setForm(emptyForm);
          setEditingId(null);
          setOriginalEmail("");
          setDrawerOpen(true);
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRestore={handleRestore}
        deleteConfirmMessage={(item) => {
          const display =
            item.firstName || item.lastName
              ? [item.firstName, item.lastName].filter(Boolean).join(" ")
              : item.fullName;
          return (
            <>
              Deactivate user{" "}
              <span className="font-semibold text-gray-900">“{display}”</span>
              {item.email ? <> (<span className="">{item.email}</span>)</> : null}?
              <br />
              The account will be marked inactive and hidden from login. You can
              re-activate it via Edit.
            </>
          );
        }}
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
            : "Configure user details, role, and access scope. Fine-grained per-page permissions live on the Permissions page."
        }
        width="xl"
        onSubmit={handleSubmit}
        loading={isSaving}
        submitLabel={
          editingId
            ? "Save Changes"
            : form.linkExistingUserId
              ? "Grant Access"
              : "Send Invite"
        }
      >
        <FormSection title="Basic Information">
          <FormRow>
            <Field label="First Name" required>
              <TextInput
                value={form.firstName}
                onChange={(v) => set("firstName", v)}
                placeholder="John"
              />
            </Field>
            <Field label="Last Name" required>
              <TextInput
                value={form.lastName}
                onChange={(v) => set("lastName", v)}
                placeholder="Doe"
              />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Email ID" required>
              <div ref={emailBoxRef} className="relative">
                <TextInput
                  value={form.email}
                  onChange={(v) => {
                    if (form.linkExistingUserId) clearLink();
                    set("email", v);
                  }}
                  type="email"
                  placeholder="john@company.com"
                  disabled={!!form.linkExistingUserId}
                  onFocus={() => {
                    if (!editingId && emailSuggestions.length > 0)
                      setEmailDropOpen(true);
                  }}
                />
                {form.linkExistingUserId && (
                  <button
                    type="button"
                    onClick={clearLink}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-orange-700 hover:text-orange-900 px-2 py-0.5 rounded bg-white border border-orange-200"
                    title="Clear and create a new user instead"
                  >
                    Clear
                  </button>
                )}
                {!editingId &&
                  !form.linkExistingUserId &&
                  emailDropOpen &&
                  form.email.trim().length >= 2 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span>Existing members in this org</span>
                      {emailSearching && (
                        <span className="text-orange-500 normal-case font-medium">
                          Searching…
                        </span>
                      )}
                    </div>
                    {emailSearchError ? (
                      <div className="px-3 py-3 text-[11px] text-red-600">
                        {emailSearchError}
                      </div>
                    ) : emailSearching && emailSuggestions.length === 0 ? (
                      <div className="px-3 py-3 text-[11px] text-gray-400">
                        Searching existing members…
                      </div>
                    ) : emailSuggestions.length === 0 ? (
                      <div className="px-3 py-3 text-[11px] text-gray-500">
                        No existing member matches{" "}
                        <span className="font-medium">{form.email.trim()}</span>. A
                        new account will be created on invite.
                      </div>
                    ) : (
                    emailSuggestions.map((hit) => {
                      const disabled = hit.hasQuikInfraAccess;
                      const displayName =
                        [hit.firstName, hit.lastName].filter(Boolean).join(" ") ||
                        hit.email;
                      return (
                        <button
                          key={hit.userId}
                          type="button"
                          disabled={disabled}
                          onClick={() => !disabled && pickExisting(hit)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                            disabled
                              ? "opacity-60 cursor-not-allowed"
                              : "hover:bg-orange-50"
                          }`}
                        >
                          <div
                            className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${memberAvatarColor(
                              displayName,
                            )}`}
                          >
                            {memberInitials(hit.firstName, hit.lastName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-800 truncate">
                              {displayName}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate">
                              {hit.email}
                            </div>
                          </div>
                          {disabled ? (
                            <span className="text-[10px] font-semibold text-gray-400 flex-shrink-0">
                              Already in QuikInfra
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-orange-600 flex-shrink-0">
                              Add to QuikInfra
                            </span>
                          )}
                        </button>
                      );
                    })
                    )}
                  </div>
                )}
              </div>
              {form.linkExistingUserId ? (
                <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-[11px] text-orange-800 leading-snug">
                  <strong className="font-semibold">Granting QuikInfra access</strong>{" "}
                  to existing user{" "}
                  <span className="font-medium">
                    {[form.firstName, form.lastName].filter(Boolean).join(" ")}
                  </span>
                  . They keep their existing password — no new invite email is
                  sent. The role &amp; scope below apply to QuikInfra only.
                </div>
              ) : !editingId ? (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Pick from the dropdown to grant QuikInfra access to an existing
                  QuikIT user without re-creating their account.
                </p>
              ) : null}
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
              options={effectiveDeptOptions}
              placeholder="Select department"
            />
            {staleDeptNotice && (
              <p className="mt-1 text-xs text-amber-600">⚠ {staleDeptNotice}</p>
            )}
          </Field>
        </FormSection>

        {/* Invitation method — Native (email + temp password) vs SSO
            (existing Google / Microsoft provider). Only relevant for new
            users; existing users keep whatever auth path they signed up
            with. Hidden when linking an existing member — no invite is
            sent in that path. Default = native. */}
        {!editingId && !form.linkExistingUserId && (
          <FormSection title="Invitation Method">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Native card */}
              <button
                type="button"
                onClick={() => set("invitationMethod", "native")}
                className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                  form.invitationMethod === "native"
                    ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    form.invitationMethod === "native" ? "text-orange-700" : "text-gray-900"
                  }`}
                >
                  Native (Email + Password)
                </div>
                <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Admin sets a password. User signs in with email + password.
                </div>
              </button>

              {/* SSO card */}
              <button
                type="button"
                onClick={() => set("invitationMethod", "sso")}
                className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                  form.invitationMethod === "sso"
                    ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    form.invitationMethod === "sso" ? "text-orange-700" : "text-gray-900"
                  }`}
                >
                  SSO (Google / Microsoft)
                </div>
                <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                  No password. User signs in via their existing provider.
                </div>
              </button>
            </div>

            {/* Conditional info banner — explains what'll happen on submit
                based on the chosen method. */}
            {form.invitationMethod === "native" ? (
              <div className="mt-3 text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 leading-relaxed">
                <span className="font-semibold">Temporary password will be emailed.</span>{" "}
                A unique temporary password will be generated and sent to{" "}
                <span className="">{form.email || "their email"}</span>.
                They&apos;ll be prompted to set a new password on first sign-in.
              </div>
            ) : (
              <div className="mt-3 text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 leading-relaxed">
                <span className="font-semibold">SSO invite link will be emailed.</span>{" "}
                {form.email || "The user"} will sign in via their existing Google
                or Microsoft account on the central auth page. No password is set
                or stored on this app.
              </div>
            )}
          </FormSection>
        )}

        <FormSection title="Role & Scope">
          <Field
            label="Role"
            required
            hint="Controls what the user can see and do. Manage roles in Settings → Roles."
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
                const d = getDescriptorByRoleName(v);
                const isAdminRole = (v ?? "").toLowerCase() === "admin";
                if (isAdminRole) {
                  set("modulesAssigned", allModuleKeys);
                } else if (!d.requiresModuleAssignment) {
                  set("modulesAssigned", []);
                }
                if (!d.requiresSiteAssignment) set("projectsAssigned", []);
                // Clear the Settings-access opt-in whenever the role is
                // anything other than ADMIN — only ADMIN can hold this
                // override, so it should never be true for other roles.
                if (!isAdminRole) {
                  set("enableSettings", false);
                }
              }}
              options={userTypeOptions}
            />
          </Field>

          {/* "Grant Settings access" override — only shown for ADMIN role.
              When checked, the user receives the 4 settings-related
              CnUserPermissionExtra rows on top of their company_admin
              role, letting them reach Settings → Users / Roles / Workflows.
              When unchecked (default), they're a sub-admin who can use
              the app fully but cannot invite users or change roles. */}
          {(form.userType ?? "").toLowerCase() === "admin" && (
            <Field
              label="Settings Access"
              hint="When ticked, this Admin can also invite users, edit roles, and reach Settings. Leave unticked to give app access only."
            >
              <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-gray-200 px-3 py-2 bg-white hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-600"
                  checked={form.enableSettings}
                  onChange={(e) => set("enableSettings", e.target.checked)}
                />
                <span className="text-sm text-gray-700">
                  Grant Settings access (invite users, manage roles)
                </span>
              </label>
            </Field>
          )}

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
                {projects.map((p) => {
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
                        <span className="text-[10px] text-gray-400">{p.code}</span>
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
