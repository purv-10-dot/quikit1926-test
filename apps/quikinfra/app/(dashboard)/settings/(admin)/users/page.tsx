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
import { UserCog } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import {
  useCreateUser, useUpdateUser, useRoles,
} from "@/hooks/use-users";
import { useProjects, useDepartments } from "@/hooks/use-masters";
import {
  ASSIGNABLE_MODULES,
  getDescriptorByRoleName,
  formatRoleLabel,
} from "@/lib/rbac/user-types";
import { toast } from "@/lib/toast";
import type { UserRow, ExistingMemberHit, InviteResult } from "./lib/types";
import { emptyForm } from "./lib/constants";
import { InviteResultDialog } from "./components/InviteResultDialog";
import { buildUserColumns } from "./components/columns";
import { UserFormDrawer, type UserFormDrawerProps } from "./components/UserFormDrawer";

export default function UsersPage() {
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
    // Modules shown are ONLY those explicitly assigned on the user record
    // (server-derived from CnUserPermissionExtra revokes). We do NOT union
    // with matrix-derived modules here: deriveModulesFromMatrix would pull
    // in every module whose role grants still have an un-revoked view action,
    // causing ALL remaining sub-modules to appear auto-selected when the admin
    // only explicitly assigned 2-3.
    const assigned = Array.isArray(item.modulesAssigned)
      ? item.modulesAssigned
      : [];
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
        : assigned,
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


  const columns = useMemo(
    () => buildUserColumns({ resendingIds, router, handleResendInvite }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resendingIds, router],
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage
        title="User Management"
        entityName="User"
        columns={columns}
        infinite={{
          queryKey: "settings-users",
          endpoint: "/api/settings/users",
          pageSize: 25,
          defaultSortBy: "createdAt",
          defaultSortOrder: "asc",
        }}
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


      <UserFormDrawer
        form={form}
        set={set}
        editingId={editingId}
        isSaving={isSaving}
        drawerOpen={drawerOpen}
        closeDrawer={closeDrawer}
        handleSubmit={handleSubmit}
        userTypeOptions={userTypeOptions}
        deptOptions={deptOptions}
        projects={projects as unknown as UserFormDrawerProps["projects"]}
        emailSuggestions={emailSuggestions}
        emailDropOpen={emailDropOpen}
        emailSearching={emailSearching}
        emailSearchError={emailSearchError}
        emailBoxRef={emailBoxRef}
        pickExisting={pickExisting}
        clearLink={clearLink}
        setEmailDropOpen={setEmailDropOpen}
        descriptor={descriptor}
        needsModules={needsModules}
        needsSites={needsSites}
        isAdminAllModules={isAdminAllModules}
        allModuleKeys={allModuleKeys}
        effectiveDeptOptions={effectiveDeptOptions}
        staleDeptNotice={staleDeptNotice}
        toggleProject={toggleProject}
        toggleModule={toggleModule}
      />

      <InviteResultDialog
        result={inviteResult}
        onClose={() => setInviteResult(null)}
      />
    </>
  );
}
