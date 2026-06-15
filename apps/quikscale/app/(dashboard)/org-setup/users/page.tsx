"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import {
  Plus,
  X,
  Search,
  Pencil,
  UserMinus,
  UserCheck,
  ChevronDown,
  Users,
  User as UserIcon,
  Check,
} from "lucide-react";
import { useTableCRUD } from "@/lib/hooks/useTableCRUD";
import {
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
  Pagination,
} from "@quikit/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPermissionsPanel } from "./components/UserPermissionsPanel";
import { RolesTab } from "./components/RolesTab";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { notify } from "@/lib/utils/notify";

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface OrgUser {
  membershipId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  /** Legacy OrgMember.role — still rendered in the table for back-compat. */
  role: string;
  /** Dynamic AppRole the user holds in QuikScale (post-v2 system). */
  appRoleId: string | null;
  appRoleName: string | null;
  teamId: string | null;
  teamIds: string[];
  teamNames: string[];
  status: string;
  lastSignInAt: string | null;
  joinedAt: string;
}

interface OrgTeam {
  id: string;
  name: string;
}

interface AppRoleOption {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
}

type InvitationMethod = "native" | "sso";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Legacy role — sent to POST/PUT for back-compat (always "member" for new users). */
  role: string;
  /** Selected AppRole.id — assigned post-create via PATCH /role. null = use server default. */
  appRoleId: string | null;
  teamIds: string[];
  status: string;
  /**
   * Set when the admin picks an existing org member from the email
   * autocomplete dropdown. Triggers the "link existing user → grant
   * QuikScale access" backend path; password field is hidden in this mode.
   */
  linkExistingUserId: string | null;
  /**
   * "native" → admin enters a password; user signs in with email+password.
   * "sso"    → no password collected; user authenticates via Google/Microsoft.
   *            Server stores `auth.User.password = null` so the password
   *            credential provider can't log them in — only OAuth works.
   */
  invitationMethod: InvitationMethod;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  role: "member",
  appRoleId: null,
  teamIds: [],
  status: "active",
  linkExistingUserId: null,
  invitationMethod: "native",
};

/* ─── Email autocomplete row ─── */
interface ExistingMemberHit {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  status: string;
  hasQuikScaleAccess: boolean;
}

const ROLES = [
  { value: "admin", label: "Admin", color: "bg-purple-100 text-purple-700" },
  {
    value: "manager",
    label: "Manager",
    color: "bg-accent-100 text-accent-700",
  },
  { value: "member", label: "Member", color: "bg-gray-100 text-gray-600" },
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function avatarColor(name: string) {
  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-red-500",
    "bg-indigo-500",
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function RoleBadge({
  appRoleName,
  legacyRole,
}: {
  /** Dynamic role from app_quikscale.UserAppRole → AppRole.name. */
  appRoleName: string | null;
  /** Legacy OrgMember.role enum — used only as a fallback when no
   *  UserAppRole row exists yet. */
  legacyRole: string;
}) {
  // Prefer the dynamic AppRole name. This is the real role assigned to
  // the user in QuikScale (admin / Member / Acountablity User / any custom
  // role the admin created). The legacy `OrgMember.role` enum is kept only
  // as a fallback for users that haven't been migrated to UserAppRole yet.
  if (appRoleName) {
    const lower = appRoleName.toLowerCase();
    const cls =
      lower === "admin"
        ? "bg-amber-50 text-amber-700"
        : lower === "member"
          ? "bg-gray-100 text-gray-700"
          : "bg-accent-50 text-accent-700";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}
      >
        {appRoleName}
      </span>
    );
  }
  const r = ROLES.find((x) => x.value === legacyRole) ?? ROLES[2];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${r.color}`}
    >
      {r.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
        Active
      </span>
    );
  if (status === "inactive")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300 inline-block" />
        Inactive
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
      Pending
    </span>
  );
}

function formatSignIn(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ─── Multi-Team Picker ──────────────────────────────────────────────────────── */
function TeamPicker({
  selectedIds,
  teams,
  onChange,
}: {
  selectedIds: string[];
  teams: OrgTeam[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  }

  const label =
    selectedIds.length === 0
      ? "No teams"
      : selectedIds.length === 1
        ? (teams.find((t) => t.id === selectedIds[0])?.name ?? "1 team")
        : `${selectedIds.length} teams`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400 text-sm"
      >
        <div className="flex items-center gap-1.5 flex-wrap min-h-[20px]">
          {selectedIds.length === 0 ? (
            <span className="text-gray-400">No teams</span>
          ) : (
            selectedIds.map((id) => {
              const t = teams.find((x) => x.id === id);
              return t ? (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-100 text-accent-700 text-[11px] font-semibold rounded-full"
                >
                  {t.name}
                  <span
                    role="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    className="cursor-pointer text-accent-400 hover:text-accent-700 leading-none"
                  >
                    ×
                  </span>
                </span>
              ) : null;
            })
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-full max-h-52 overflow-y-auto">
          {teams.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">
              No teams available
            </p>
          ) : (
            teams.map((t) => {
              const checked = selectedIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${checked ? "bg-accent-50" : ""}`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      checked
                        ? "bg-accent-600 border-accent-600"
                        : "border-gray-300"
                    }`}
                  >
                    {checked && <Check className="h-2.5 w-2.5 text-white" />}
                  </span>
                  <span
                    className={`text-sm ${checked ? "text-accent-700 font-medium" : "text-gray-700"}`}
                  >
                    {t.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ─── User Panel (Add / Edit) ───────────────────────────────────────────────── */
function UserPanel({
  open,
  onClose,
  onSaved,
  editUser,
  teams,
  appRoles,
  canCreate = true,
  canUpdate = true,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (u: OrgUser) => void;
  editUser: OrgUser | null;
  teams: OrgTeam[];
  appRoles: AppRoleOption[];
  /** RBAC v2 — when denied, fields are disabled and Save is hidden. */
  canCreate?: boolean;
  canUpdate?: boolean;
}) {
  const drawerLocked = editUser ? !canUpdate : !canCreate;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [roleOpen, setRoleOpen] = useState(false);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setForm(
        editUser
          ? {
              firstName: editUser.firstName,
              lastName: editUser.lastName,
              email: editUser.email,
              password: "",
              role: editUser.role,
              appRoleId: editUser.appRoleId,
              teamIds:
                editUser.teamIds ?? (editUser.teamId ? [editUser.teamId] : []),
              status: editUser.status,
              linkExistingUserId: null,
              invitationMethod: "native",
            }
          : EMPTY_FORM
      );
      setError("");
      setEmailSuggestions([]);
      setEmailDropOpen(false);
    }
  }, [open, editUser]);

  /* ─ Email autocomplete state ─
     When admin types in the email field (and we're in CREATE mode), debounce
     a search against /api/org/users/search. Hits are existing OrgMembers of
     this org — they may already belong via QuikVC / QuikTrack / etc. and
     just need a UserAppAccess row for QuikScale. */
  const [emailSuggestions, setEmailSuggestions] = useState<ExistingMemberHit[]>([]);
  const [emailDropOpen, setEmailDropOpen] = useState(false);
  const emailBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editUser) return; // Edit mode: don't autocomplete (email locked anyway)
    if (form.linkExistingUserId) return; // already linked — don't search
    const q = form.email.trim();
    if (q.length < 2) {
      setEmailSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/org/users/search?email=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (json.success) {
          setEmailSuggestions(json.data as ExistingMemberHit[]);
          setEmailDropOpen(true);
        }
      } catch {
        // network error — silently ignore; user can still submit fresh create
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [form.email, form.linkExistingUserId, editUser]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (emailBoxRef.current && !emailBoxRef.current.contains(e.target as Node))
        setEmailDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function pickExisting(hit: ExistingMemberHit) {
    setForm((p) => ({
      ...p,
      firstName: hit.firstName,
      lastName: hit.lastName,
      email: hit.email,
      password: "",
      linkExistingUserId: hit.userId,
    }));
    setEmailDropOpen(false);
  }

  function clearLink() {
    setForm((p) => ({ ...p, linkExistingUserId: null }));
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (roleRef.current && !roleRef.current.contains(e.target as Node))
        setRoleOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.firstName.trim()) {
      setError("First name is required.");
      return;
    }
    if (!form.lastName.trim()) {
      setError("Last name is required.");
      return;
    }
    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }
    // Native invites no longer require a typed password — when left blank,
    // the server generates a fresh temporary password and emails it to the
    // invitee, matching the QuikIT super-admin onboarding flow.

    setSaving(true);
    setError("");
    try {
      // Legacy `role` field still required for back-compat with OrgMember.role.
      // The authoritative role assignment is the AppRole (PATCH below).
      const payload: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: "member",
        teamIds: form.teamIds,
      };
      // Only attach password when the admin actually typed one. An empty
      // string would fail Zod's min(8) on the server. For new Native users
      // who leave it blank, the server generates a fresh temp password.
      if (form.password.trim()) payload.password = form.password.trim();
      if (editUser) payload.status = form.status;
      if (!editUser && form.linkExistingUserId) payload.linkExistingUserId = form.linkExistingUserId;
      if (!editUser && !form.linkExistingUserId) {
        payload.invitationMethod = form.invitationMethod;
      }

      const url = editUser
        ? `/api/org/users/${editUser.userId}`
        : "/api/org/users";
      const method = editUser ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to save");
        return;
      }

      const savedUser = json.data as OrgUser & { tempPassword?: string };

      // Apply the chosen AppRole via PATCH /role. The POST endpoint already
      // auto-assigns the default User role (or admin if org has zero admins),
      // so we only PATCH when the form's choice differs from what came back.
      if (form.appRoleId && form.appRoleId !== savedUser.appRoleId) {
        try {
          const patchRes = await fetch(
            `/api/org/users/${savedUser.userId}/role`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ roleId: form.appRoleId }),
            },
          );
          const patchJson = await patchRes.json();
          if (patchJson.success && patchJson.data?.appRole) {
            savedUser.appRoleId = patchJson.data.appRole.id;
            savedUser.appRoleName = patchJson.data.appRole.name;
          }
        } catch {
          // Non-fatal — user was created/updated successfully, role assignment failed.
          // The admin can fix it via the role dropdown later.
        }
      }

      // Success toast — match the actual action (edit / link-existing / invite).
      if (editUser) {
        notify.saved("User", "updated");
      } else if (form.linkExistingUserId) {
        notify.success("QuikScale access granted");
      } else {
        notify.success("User invited");
      }

      onSaved(savedUser);
      // If a temp password came back, keep the panel open so the parent's
      // modal can render the plaintext once. Otherwise close immediately.
      if (!savedUser.tempPassword) {
        onClose();
      } else {
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
      notify.error(err, { context: "user" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const selectedAppRole = appRoles.find((r) => r.id === form.appRoleId) ?? null;

  return (
    <RightPanel
      open
      onClose={onClose}
      size="sm"
      title={editUser ? "Edit User" : "Add New User"}
      subtitle={
        editUser
          ? "Update user details and team memberships"
          : "Create a user account and assign to teams"
      }
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          {!drawerLocked && (
            <RightPanelSubmitButton
              onClick={handleSubmit}
              saving={saving}
              icon={editUser ? "check" : "plus"}
              label={
                editUser
                  ? "Update User"
                  : form.linkExistingUserId
                    ? "Grant QuikScale Access"
                    : "Add User"
              }
            />
          )}
        </RightPanelFooter>
      }
    >
      {drawerLocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 mb-3">
          Read-only — your role doesn&apos;t grant {editUser ? "update" : "create"} access on Users.
        </div>
      )}
      <fieldset disabled={drawerLocked} className={`space-y-4 ${drawerLocked ? "opacity-70" : ""}`}>
      {/* Name row — disabled when linking existing (values prefilled from user record) */}
      <div className="grid grid-cols-2 gap-4" style={form.linkExistingUserId ? { opacity: 0.6, pointerEvents: "none" } : undefined}>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">
            First Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            placeholder="Jane"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">
            Last Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            placeholder="Smith"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Email — typeahead against existing org members in CREATE mode */}
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1.5">
          Email Address <span className="text-red-400">*</span>
        </label>
        <div ref={emailBoxRef} className="relative">
          <input
            type="email"
            value={form.email}
            onChange={(e) => {
              if (form.linkExistingUserId) clearLink();
              set("email", e.target.value);
            }}
            onFocus={() => {
              if (!editUser && emailSuggestions.length > 0) setEmailDropOpen(true);
            }}
            disabled={!!editUser || !!form.linkExistingUserId}
            placeholder="jane@company.com"
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400 ${
              form.linkExistingUserId
                ? "border-accent-300 bg-accent-50 text-gray-700"
                : "border-gray-200"
            } ${editUser ? "bg-gray-50 text-gray-500" : ""}`}
          />
          {form.linkExistingUserId && (
            <button
              type="button"
              onClick={() => {
                clearLink();
                setForm((p) => ({ ...p, firstName: "", lastName: "", email: "" }));
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-accent-700 hover:text-accent-900 px-2 py-0.5 rounded bg-white border border-accent-200"
              title="Clear and create new user instead"
            >
              Clear
            </button>
          )}
          {!editUser && emailDropOpen && emailSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100">
                Existing members in this org
              </div>
              {emailSuggestions.map((hit) => {
                const disabled = hit.hasQuikScaleAccess;
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
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avatarColor(
                        `${hit.firstName} ${hit.lastName}`,
                      )}`}
                    >
                      {initials(hit.firstName, hit.lastName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">
                        {hit.firstName} {hit.lastName}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {hit.email}
                      </div>
                    </div>
                    {disabled ? (
                      <span className="text-[10px] font-semibold text-gray-400 flex-shrink-0">
                        Already in QuikScale
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-accent-600 flex-shrink-0">
                        Add to QuikScale
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {form.linkExistingUserId ? (
          <div className="mt-2 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2 text-[11px] text-accent-800 leading-snug">
            <strong className="font-semibold">Granting QuikScale access</strong> to existing user{" "}
            <span className="font-medium">
              {form.firstName} {form.lastName}
            </span>
            . They keep their existing password — no new invite email is sent. The role + teams
            below apply to QuikScale only.{" "}
            <button
              type="button"
              onClick={() => {
                clearLink();
                setForm((p) => ({ ...p, firstName: "", lastName: "", email: "" }));
              }}
              className="underline font-medium hover:text-accent-900"
            >
              Create a new user instead
            </button>
          </div>
        ) : !editUser ? (
          <p className="text-[11px] text-gray-400 mt-1.5">
            Pick from the dropdown to grant QuikScale access to an existing QuikIT user without
            re-creating their account.
          </p>
        ) : null}
      </div>

      {/* Invitation Method — only on create-new-user (not edit, not linking) */}
      {!editUser && !form.linkExistingUserId && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">
            Invitation Method
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  key: "native" as const,
                  title: "Native (Email + Password)",
                  hint: "Admin sets a password. User signs in with email + password.",
                },
                {
                  key: "sso" as const,
                  title: "SSO (Google / Microsoft)",
                  hint: "No password. User signs in via their existing provider.",
                },
              ]
            ).map((opt) => {
              const active = form.invitationMethod === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => set("invitationMethod", opt.key)}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    active
                      ? "border-accent-500 bg-accent-50 ring-1 ring-accent-300"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className={`text-xs font-semibold ${active ? "text-accent-700" : "text-gray-800"}`}>
                    {opt.title}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{opt.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Password — only shown in Edit mode (admin can change an existing user's
          password). For new users, Native invitees receive a freshly-generated
          temporary password via email and reset it on first sign-in; SSO
          invitees never have a password. Mirrors the super-admin
          first-Org-Admin flow. */}
      {editUser && !form.linkExistingUserId && (
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1.5">
          Password{" "}
          <span className="text-gray-400 font-normal">
            (leave blank to keep unchanged)
          </span>
        </label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder="Enter new password to change"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 placeholder-gray-400"
        />
      </div>
      )}

      {/* Native-invite notice — explains the auto-generated password flow */}
      {!editUser && !form.linkExistingUserId && form.invitationMethod === "native" && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg px-3 py-2 text-[11px] text-accent-800 leading-snug">
          <strong className="font-semibold">Temporary password will be emailed.</strong>{" "}
          A unique temporary password will be generated and sent to{" "}
          <span className="font-medium">{form.email || "their email"}</span>. They&apos;ll
          be prompted to set a new password on first sign-in.
        </div>
      )}

      {/* Role — dynamic AppRole list from /api/org/roles */}
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1.5">
          Role <span className="text-red-400">*</span>
        </label>
        <div ref={roleRef} className="relative">
          <button
            type="button"
            onClick={() => setRoleOpen((o) => !o)}
            className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-400"
          >
            {selectedAppRole ? (
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                    selectedAppRole.isSystem
                      ? "bg-amber-100 text-amber-700"
                      : selectedAppRole.isDefault
                        ? "bg-accent-100 text-accent-700"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {selectedAppRole.name}
                </span>
                {selectedAppRole.isDefault && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-accent-600">
                    Default
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-gray-400">
                {appRoles.length === 0 ? "Loading roles…" : "Use org default"}
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>
          {roleOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-full max-h-64 overflow-y-auto">
              {/* "Use org default" — clears the explicit selection so the
                  server's auto-assignment runs (User by default; admin if zero
                  admins exist). */}
              <button
                type="button"
                onClick={() => {
                  set("appRoleId", null);
                  setRoleOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${form.appRoleId === null ? "bg-accent-50" : ""}`}
              >
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600">
                  Use org default
                </span>
                <span className="text-xs text-gray-400">
                  Picks the role marked Default
                </span>
              </button>
              {appRoles.length === 0 && (
                <p className="px-4 py-3 text-xs text-gray-400">
                  No roles available yet.
                </p>
              )}
              {appRoles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    set("appRoleId", r.id);
                    setRoleOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${form.appRoleId === r.id ? "bg-accent-50" : ""}`}
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold flex-shrink-0 ${
                      r.isSystem
                        ? "bg-amber-100 text-amber-700"
                        : r.isDefault
                          ? "bg-accent-100 text-accent-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {r.name}
                  </span>
                  {r.description ? (
                    <span className="text-xs text-gray-400 truncate">
                      {r.description}
                    </span>
                  ) : r.isSystem ? (
                    <span className="text-xs text-gray-400">System role</span>
                  ) : r.isDefault ? (
                    <span className="text-xs text-gray-400">Default for new users</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Teams (multi-select) */}
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1.5">
          Teams{" "}
          <span className="text-gray-400 font-normal">
            (select one or more)
          </span>
        </label>
        <TeamPicker
          selectedIds={form.teamIds}
          teams={teams}
          onChange={(ids) => set("teamIds", ids)}
        />
      </div>

      {/* Status (edit only) */}
      {editUser && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">
            Status
          </label>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {["active", "inactive"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("status", s)}
                className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors ${
                  form.status === s
                    ? s === "active"
                      ? "bg-green-500 text-white"
                      : "bg-gray-400 text-white"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      </fieldset>
    </RightPanel>
  );
}

/* ─── Confirm Dialog ─────────────────────────────────────────────────────────── */
function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  dangerous = true,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  dangerous?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-80 max-w-full">
        <h3 className="text-sm font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-xs text-gray-500 mb-5">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-lg ${dangerous ? "bg-red-500 hover:bg-red-600" : "bg-accent-600 hover:bg-accent-700"}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function OrgUsersPage() {
  // `canCreate` (server-side User.create) still controls whether the edit
  // drawer can submit a create. The Add User BUTTON visibility is gated
  // separately below by the UI-only `User.AddUser.create` sub-permission.
  const { canCreate, canUpdate } = useResourcePermissions("User");
  // RBAC v2 — Add User button + User Management tab are gated by the nested
  // UI-only sub-permissions under OrgSetup → Users (mirrors OPSP.History →
  // EditFinalize). Admin role bypass is handled inside `useMyPermissions()`.
  // Strict gating: a Member who has `User.create` on the API but no
  // `User.AddUser.create` will NOT see the button — the sub-permission is
  // the single source of truth for button visibility.
  const myPerms = useMyPermissions();
  const canShowAddUser = myPerms.isAdmin || myPerms.has("User.AddUser", "create");
  const canViewUserMgmt = myPerms.isAdmin || myPerms.has("User.Management", "view");
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  // Shared cache invalidator — every user mutation (create/edit/status-change/
  // delete) updates membership-driven views elsewhere (Dashboard Owner filter,
  // KPI/Priority pickers, team member counts on Org Setup → Teams). Without
  // these invalidations consumers hold stale data until the 5-minute staleTime
  // elapses or the user hard-refreshes.
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState("");
  // Default to "" (All statuses) so the Users list mirrors the full member set
  // (active + inactive) — same 89-member universe as Analytics → Individual.
  // "active" is now an opt-in narrowing filter, not the default.
  const [statusFilter, setStatusFilter] = useState("");
  // Role + status filters run at the DB level via fetchParams; memoised so the
  // hook only refetches when a filter value actually changes.
  const usersFetchParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter) p.status = statusFilter;
    if (roleFilter) p.role = roleFilter;
    return p;
  }, [statusFilter, roleFilter]);

  const crud = useTableCRUD<OrgUser>({
    apiEndpoint: "/api/org/users",
    idKey: "userId",
    searchFields: ["firstName", "lastName", "email"],
    fetchParams: usersFetchParams,
    // DB-level pagination + search (name/email) + sort. Role/status come via
    // fetchParams above.
    serverPagination: true,
    defaultSort: "name:asc",
  });

  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [confirmUser, setConfirmUser] = useState<OrgUser | null>(null);
  const [confirmAction, setConfirmAction] = useState<"remove" | "reactivate">(
    "remove"
  );
  // Holds the one-time plaintext temp password to show the inviting admin
  // after a successful Native user-create. Plaintext lives only here, in
  // React state — never localStorage / sessionStorage / DB.
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Fetch the AppRoles list — drives the Role dropdown in the Add/Edit panel.
  // Keyed in React Query so creating/deleting a role in the User Management
  // tab (RolesTab) can invalidate ["org-roles"] and have this dropdown refresh
  // live — without it, a freshly-created role wouldn't appear here until a
  // hard page reload (both tabs share this same mounted page component).
  const { data: appRoles = [] } = useQuery({
    queryKey: ["org-roles"],
    queryFn: async () => {
      const res = await fetch("/api/org/roles");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load roles");
      return json.data as AppRoleOption[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch teams alongside users
  useEffect(() => {
    fetch("/api/org/teams")
      .then((r) => r.json())
      .then((json) => {
        if (json.success)
          setTeams(
            json.data.map((t: { id: string; name: string }) => ({
              id: t.id,
              name: t.name,
            }))
          );
      });
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search + role + status now all run at the DB level, so `crud.filtered` is
  // already the correct server-filtered page — no client-side filtering here.
  const filtered = crud.filtered;

  // Role/status are sent server-side; reset to the first page when either
  // changes so we never land on an out-of-range page. (Search resets inside
  // the hook via its debounce.)
  useEffect(() => {
    crud.setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, statusFilter]);

  function handleSaved(user: OrgUser & { tempPassword?: string }) {
    // Optimistic write keeps the list responsive while the temp-password
    // modal opens — no ~150ms gap between "User invited" toast and the new
    // row appearing.
    crud.setItems((prev) => {
      const idx = prev.findIndex((u) => u.userId === user.userId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = user;
        return next;
      }
      return [...prev, user];
    });
    // Reconcile with server. The POST response doesn't always carry every
    // field the canonical GET returns — auto-assigned UserAppRole, joined
    // team names, lastSignInAt, etc. land via downstream hooks (the
    // optional PATCH /role, default-role seeder, audit-log writer). Without
    // this refetch the optimistically-written row could stay partially
    // stale until the admin hard-reloaded the page.
    crud.refetch();
    // Bust shared caches — user team assignment / role / status changes ripple
    // into every consumer that reads users or teams.
    queryClient.invalidateQueries({ queryKey: ["teams"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["users-infinite"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    // Surface the plaintext temp password ONCE for the inviting admin.
    // Lives only in React state until the modal closes — never persisted.
    if (user.tempPassword) {
      setTempPasswordInfo({
        email: user.email,
        tempPassword: user.tempPassword,
      });
    }
  }

  async function handleStatusChange(
    user: OrgUser,
    newStatus: "inactive" | "active"
  ) {
    try {
      const res = await fetch(`/api/org/users/${user.userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!json.success) {
        notify.error(json.error, { context: "user" });
        return;
      }
      handleSaved(json.data);
      notify.success(
        newStatus === "active" ? "User reactivated" : "User deactivated",
      );
    } catch (err: unknown) {
      notify.error(err, { context: "user" });
    } finally {
      setConfirmUser(null);
    }
  }

  // `crud.total` is the server-side count for the current filter set. With no
  // status filter (the default) this is the full member count (active +
  // inactive). Picking Active/Inactive narrows it.
  const totalForFilter = crud.total;
  const filterCount =
    (roleFilter ? 1 : 0) + (statusFilter ? 1 : 0);

  // Server-side pagination — the API already returns the requested page.
  const pagedUsers = filtered;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-200 bg-white flex-shrink-0">
        {(
          [
            { key: "users", label: "Users" },
            ...(canViewUserMgmt ? [{ key: "roles" as const, label: "User Management" }] : []),
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-accent-600 text-accent-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "roles" && canViewUserMgmt && <RolesTab />}

      {tab === "users" && (
      <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent-100 flex items-center justify-center">
            <Users className="h-4 w-4 text-accent-600" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Users</h1>
            <p className="text-xs text-gray-400">
              {totalForFilter}{statusFilter === "active" ? " active" : statusFilter === "inactive" ? " inactive" : ""} member{totalForFilter !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={crud.search}
              onChange={(e) => crud.setSearch(e.target.value)}
              placeholder="Search users…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 w-48"
            />
          </div>

          {/* Filter */}
          <div ref={filterRef} className="relative">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg ${
                filterCount > 0
                  ? "border-accent-300 bg-accent-50 text-accent-600"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Filter
              {filterCount > 0 && (
                <span className="ml-0.5 bg-accent-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {filterCount}
                </span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-52 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    Status
                  </p>
                  <div className="space-y-1">
                    {[
                      { v: "", l: "All" },
                      { v: "active", l: "Active" },
                      { v: "inactive", l: "Inactive" },
                    ].map(({ v, l }) => (
                      <button
                        key={v}
                        onClick={() => setStatusFilter(v)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${statusFilter === v ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    Role
                  </p>
                  <div className="space-y-1">
                    <button
                      onClick={() => setRoleFilter("")}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${!roleFilter ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                    >
                      All roles
                    </button>
                    {ROLES.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setRoleFilter(r.value)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${roleFilter === r.value ? "bg-accent-50 text-accent-600 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Add User — gated by the dedicated `User.AddUser.create` sub-permission. */}
          {canShowAddUser && (
            <button
              onClick={() => crud.openCreate()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" /> Add User
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full border-collapse" style={{ minWidth: 860 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {[
                "User",
                "Email",
                "Role",
                "Teams",
                "Status",
                "Last Sign In",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {crud.loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-16 text-sm text-gray-400"
                >
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <UserIcon className="h-8 w-8 text-gray-200" />
                    <p className="text-sm text-gray-400 font-medium">
                      No users found
                    </p>
                    {!crud.search && (
                      <p className="text-xs text-gray-400">
                        Click <span className="font-semibold">Add User</span> to
                        invite someone.
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              pagedUsers.map((u) => {
                const full = `${u.firstName} ${u.lastName}`;
                const color = avatarColor(full);
                const teamNames = u.teamNames?.length
                  ? u.teamNames
                  : u.teamId
                    ? ["—"]
                    : [];
                const isExpanded = expandedUserId === u.userId;
                return (
                  <Fragment key={u.userId}>
                  <tr
                    onClick={() => setExpandedUserId(isExpanded ? null : u.userId)}
                    className="hover:bg-gray-50/60 transition-colors group cursor-pointer"
                  >
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${color}`}
                        >
                          {initials(u.firstName, u.lastName)}
                        </div>
                        <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                          {full}
                        </span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </td>
                    {/* Email */}
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {u.email}
                    </td>
                    {/* Role — prefer the dynamic AppRole from
                        app_quikscale.UserAppRole; fall back to the legacy
                        OrgMember.role enum only if no UserAppRole exists. */}
                    <td className="px-4 py-3">
                      <RoleBadge appRoleName={u.appRoleName} legacyRole={u.role} />
                    </td>
                    {/* Teams — chips */}
                    <td className="px-4 py-3">
                      {teamNames.length === 0 ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {teamNames.map((name, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status} />
                    </td>
                    {/* Last Sign In */}
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {formatSignIn(u.lastSignInAt)}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => crud.openEdit(u)}
                          title="Edit"
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-accent-600 hover:bg-accent-50 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {u.status === "active" ? (
                          <button
                            onClick={() => {
                              setConfirmUser(u);
                              setConfirmAction("remove");
                            }}
                            title="Deactivate"
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setConfirmUser(u);
                              setConfirmAction("reactivate");
                            }}
                            title="Reactivate"
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={u.userId + "-expand"}>
                      <td colSpan={7} className="p-0">
                        <UserPermissionsPanel
                          userId={u.userId}
                          onClose={() => setExpandedUserId(null)}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
        </div>
        {crud.total > 0 && (
          <Pagination
            page={crud.page}
            totalPages={crud.totalPages}
            total={crud.total}
            limit={crud.limit}
            onPageChange={crud.setPage}
            onPageSizeChange={(size) => { crud.setLimit(size); crud.setPage(1); }}
          />
        )}
      </div>
      </>
      )}

      {/* ── Panel ── */}
      <UserPanel
        open={crud.panelOpen}
        onClose={crud.closePanel}
        onSaved={handleSaved}
        editUser={crud.editItem}
        teams={teams}
        appRoles={appRoles}
        canCreate={canCreate}
        canUpdate={canUpdate}
      />

      {/* ── Confirm Dialog ── */}
      <ConfirmDialog
        open={!!confirmUser}
        title={
          confirmAction === "remove" ? "Deactivate User?" : "Reactivate User?"
        }
        message={
          confirmAction === "remove"
            ? `${confirmUser?.firstName} ${confirmUser?.lastName} will no longer have access. You can reactivate them at any time.`
            : `${confirmUser?.firstName} ${confirmUser?.lastName} will regain full access to the organisation.`
        }
        dangerous={confirmAction === "remove"}
        onCancel={() => setConfirmUser(null)}
        onConfirm={() =>
          confirmUser &&
          handleStatusChange(
            confirmUser,
            confirmAction === "remove" ? "inactive" : "active"
          )
        }
      />

      {/* ── Temp-password reveal modal (shown ONCE after Native invite) ── */}
      {tempPasswordInfo && (
        <TempPasswordModal
          email={tempPasswordInfo.email}
          tempPassword={tempPasswordInfo.tempPassword}
          onClose={() => setTempPasswordInfo(null)}
        />
      )}
    </div>
  );
}

/**
 * One-time success modal that reveals the plaintext temporary password the
 * server generated for a freshly invited Native user. The plaintext is held
 * only in React state for the lifetime of this modal — closing it discards
 * the value. We never persist it (no localStorage / sessionStorage / DB).
 */
function TempPasswordModal({
  email,
  tempPassword,
  onClose,
}: {
  email: string;
  tempPassword: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked; user can still select+copy manually.
    }
  }

  return (
    <div
      // `z-[200]` so the modal sits above the `z-[100]` dashboard header in
      // `components/dashboard/header.tsx`. Matches the convention used by the
      // confirm-delete modal at line 987 in this file. Lower z-indexes left
      // the header + sidebar bright and clickable on top of the backdrop.
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl ring-1 ring-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900">User invited</h2>
        <p className="mt-1 text-sm text-gray-600">
          A temporary password has been emailed to{" "}
          <span className="font-medium text-gray-900">{email}</span>. You can
          also share it manually below — this is shown only once.
        </p>
        <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Temporary password
          </div>
          <div className="mt-1 break-all font-mono text-sm text-gray-900">
            {tempPassword}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
          >
            {copied ? "Copied!" : "Copy password"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
