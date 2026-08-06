"use client";

import type { ReactNode, RefObject } from "react";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, SelectInput, CheckboxInput,
} from "@/components/FormDrawer";
import { ASSIGNABLE_MODULES, getDescriptorByRoleName } from "@/lib/rbac/user-types";
import { memberInitials, memberAvatarColor } from "../lib/utils";
import type { UserForm } from "../lib/constants";
import type { ExistingMemberHit } from "../lib/types";

type Opt = { value: string; label: string };

export interface UserFormDrawerProps {
  form: UserForm;
  set: (key: keyof UserForm, val: string | string[] | boolean | null) => void;
  editingId: string | null;
  isSaving: boolean;
  drawerOpen: boolean;
  closeDrawer: () => void;
  handleSubmit: () => void;
  userTypeOptions: Opt[];
  deptOptions: Opt[];
  projects: Array<{ id: string; name?: string; code?: string; status?: string; [k: string]: unknown }>;
  emailSuggestions: ExistingMemberHit[];
  emailDropOpen: boolean;
  emailSearching: boolean;
  emailSearchError: string | null;
  emailBoxRef: RefObject<HTMLDivElement>;
  pickExisting: (hit: ExistingMemberHit) => void;
  clearLink: () => void;
  setEmailDropOpen: (v: boolean) => void;
  descriptor: ReturnType<typeof getDescriptorByRoleName>;
  needsModules: boolean;
  needsSites: boolean;
  isAdminAllModules: boolean;
  allModuleKeys: string[];
  effectiveDeptOptions: Opt[];
  staleDeptNotice: ReactNode;
  toggleProject: (projectId: string) => void;
  toggleModule: (moduleKey: string) => void;
}

export function UserFormDrawer({
  form, set, editingId, isSaving, drawerOpen, closeDrawer, handleSubmit,
  userTypeOptions, deptOptions, projects,
  emailSuggestions, emailDropOpen, emailSearching, emailSearchError,
  emailBoxRef, pickExisting, clearLink, setEmailDropOpen,
  descriptor, needsModules, needsSites, isAdminAllModules, allModuleKeys,
  effectiveDeptOptions, staleDeptNotice, toggleProject, toggleModule,
}: UserFormDrawerProps) {
  return (
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-accent-700 hover:text-accent-900 px-2 py-0.5 rounded bg-white border border-accent-200"
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
                        <span className="text-accent-500 normal-case font-medium">
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
                              : "hover:bg-accent-50"
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
                            <span className="text-[10px] font-semibold text-accent-600 flex-shrink-0">
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
                <div className="mt-2 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2 text-[11px] text-accent-800 leading-snug">
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
                    ? "border-accent-500 bg-accent-50 ring-2 ring-accent-200"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    form.invitationMethod === "native" ? "text-accent-700" : "text-gray-900"
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
                    ? "border-accent-500 bg-accent-50 ring-2 ring-accent-200"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    form.invitationMethod === "sso" ? "text-accent-700" : "text-gray-900"
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
                  className="h-4 w-4 accent-accent-600"
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
                        className="w-3.5 h-3.5 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
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
                        className="w-3.5 h-3.5 rounded border-gray-300 text-accent-600 focus:ring-accent-500 disabled:opacity-100"
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
  );
}
