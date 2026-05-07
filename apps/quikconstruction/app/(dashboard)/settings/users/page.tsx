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

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCog, ShieldCheck, Send } from "lucide-react";
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
  HO_USER: "bg-blue-50 text-blue-700 border-blue-200",
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

export default function UsersPage() {
  const router = useRouter();
  const { data: result, isLoading } = useUsers();
  const { data: projectsResult } = useProjects();
  const { data: deptsResult } = useDepartments();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
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
    if (!form.username) return alert("Username is required");
    if (!form.fullName) return alert("Full Name is required");
    if (!form.email) return alert("Email is required");
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile)) {
      return alert("Mobile must be 10 digits starting with 6, 7, 8, or 9");
    }

    // Don't ship passwords here — new users set their own via the
    // emailed invite link; existing users hit password reset (Phase 2).
    const { password: _p, retypePassword: _rp, ...payload } = form;

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
      } else {
        const res: any = await createMutation.mutateAsync(payload);
        // Dev helper: copy the invite URL to clipboard + toast it so
        // the admin doesn't have to dig through `.data/outbox/`.
        const inviteUrl = res?.invite?.url;
        const mailSent = res?.invite?.mail?.sent;
        const mailError = res?.invite?.mail?.error;
        const tempPassword = res?.invite?.tempPassword;
        if (inviteUrl) {
          try {
            await navigator.clipboard.writeText(inviteUrl);
          } catch {
            // Clipboard blocked — not fatal, we still show the URL
          }
          if (mailSent) {
            alert(
              `✅ Invite email sent to ${res.email}.\n\n` +
                `URL (copied to clipboard):\n${inviteUrl}\n\n` +
                (tempPassword ? `Temporary password: ${tempPassword}` : "")
            );
          } else {
            alert(
              `⚠ User created, but invite email could not be delivered.\n\n` +
                `SMTP error: ${mailError ?? "(none reported)"}\n\n` +
                `You can log in manually with:\n` +
                `  URL:      ${inviteUrl}\n` +
                `  Email:    ${res.email}\n` +
                (tempPassword
                  ? `  Password: ${tempPassword}\n\n`
                  : "  Password: (see server console)\n\n") +
                `The credentials above are live — paste them into the login screen.`
            );
          }
        }
      }
      closeDrawer();
    } catch (err: any) {
      alert(err.message ?? "Failed to save user");
    }
  };

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const handleResendInvite = async (item: any) => {
    try {
      const res = await fetch(`/api/settings/users/${item.id}/resend-invite`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to resend invite");
      const inviteUrl = json?.invite?.url;
      const mailSent = json?.invite?.mail?.sent;
      if (inviteUrl) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
        } catch {
          /* ignore */
        }
      }
      alert(
        mailSent
          ? `Invite resent to ${item.email}.\n\nInvite URL (copied to clipboard):\n${inviteUrl}`
          : `Email not delivered — share this URL manually:\n${inviteUrl}`
      );
    } catch (err: any) {
      alert(err.message ?? "Failed to resend invite");
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
        width: "110px",
        render: (row) => {
          const isInvited = !row.acceptedAt && row.status === "invited";
          const isInactive = row.status === "inactive";
          if (isInvited) {
            return (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200">
                Invited
              </span>
            );
          }
          if (isInactive) {
            return (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-gray-50 text-gray-500 border-gray-200">
                Inactive
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
          const isInvited = !row.acceptedAt && row.status === "invited";
          const isSuperAdmin = row.userType === "SUPER_ADMIN";
          return (
            <div className="flex items-center gap-3">
              {!isSuperAdmin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/settings/users/${row.id}/permissions`);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  title="Configure per-menu Add/Edit/Delete/View permissions"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> Permissions
                </button>
              )}
              {isInvited && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResendInvite(row);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 hover:underline"
                  title="Rotate token and resend invitation email"
                >
                  <Send className="w-3.5 h-3.5" /> Resend
                </button>
              )}
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router]
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
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users" }]}
        onAdd={() => {
          setForm(emptyForm);
          setEditingId(null);
          setDrawerOpen(true);
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        canDelete={(item) => item.userType !== "SUPER_ADMIN"}
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
            <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 leading-relaxed">
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

        <FormSection title="Status">
          <Field label="Status">
            <SelectInput
              value={form.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </Field>
        </FormSection>
      </FormDrawer>
    </>
  );
}
