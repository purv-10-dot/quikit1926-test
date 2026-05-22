"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import {
  Button,
  Input,
  Select,
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
} from "@quikit/ui";
import { ProjectsPicker } from "./projects-picker";

interface AppRole {
  id: string;
  name: string;
  isDefault: boolean;
}

interface SearchResult {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  hasQuikTrackAccess: boolean;
}

export function AddUserModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<AddUserDrawer onClose={onClose} />, document.body);
}

function AddUserDrawer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appRoleId, setAppRoleId] = useState(""); // "" → org default
  const [projectIds, setProjectIds] = useState<string[]>([]);
  /** Map projectId → projectRoleId. Missing key = use that project's default role. */
  const [projectRoles, setProjectRoles] = useState<Record<string, string>>({});
  const [linkExistingUserId, setLinkExistingUserId] = useState<string | null>(null);
  // After a successful create, the server may return a freshly-generated
  // plaintext temp password (Native + no admin-supplied pw). We hold it in
  // local state ONLY while the success view is visible — closing the drawer
  // discards it. Never persisted to localStorage / sessionStorage / DB.
  const [createdTempPassword, setCreatedTempPassword] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  /**
   * "native" → admin sets password, user signs in with email+password.
   * "sso"    → no password collected; user authenticates via Google/Microsoft.
   *            Server stores `User.password = null` so the credentials
   *            provider can't log them in — only OAuth works. The signIn
   *            callback in @quikit/auth auto-accepts the invite on first
   *            OAuth login.
   */
  const [invitationMethod, setInvitationMethod] = useState<"native" | "sso">("native");
  const [error, setError] = useState<string | null>(null);

  // Email typeahead.
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [showHits, setShowHits] = useState(false);
  const emailWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(email.trim()), 250);
    return () => clearTimeout(t);
  }, [email]);

  useEffect(() => {
    if (!showHits) return;
    function onDown(e: MouseEvent) {
      if (!emailWrapRef.current?.contains(e.target as Node)) setShowHits(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showHits]);

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "org-roles"],
    queryFn: async () => {
      const r = await fetch("/api/org/roles");
      const j = await r.json();
      return (j.data as AppRole[]) ?? [];
    },
  });

  const searchQ = useQuery({
    queryKey: ["quiktrack", "user-search", debouncedEmail],
    queryFn: async () => {
      const r = await fetch(`/api/users/search?q=${encodeURIComponent(debouncedEmail)}&limit=10`);
      const j = await r.json();
      return (j.data as SearchResult[]) ?? [];
    },
    enabled: debouncedEmail.length >= 2 && !linkExistingUserId,
  });

  function pickHit(hit: SearchResult) {
    if (hit.hasQuikTrackAccess) return; // disabled row — no-op
    setFirstName(hit.firstName);
    setLastName(hit.lastName);
    setEmail(hit.email);
    setLinkExistingUserId(hit.userId);
    setPassword("");
    setShowHits(false);
  }

  function clearLink() {
    setLinkExistingUserId(null);
    setFirstName("");
    setLastName("");
    setEmail("");
  }

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        firstName,
        lastName,
        email,
        // Linking an existing user skips the credentials section entirely.
        // For a brand-new user:
        //   • SSO   → send `invitationMethod: "sso"`, no password.
        //   • Native + admin typed a password → send both.
        //   • Native + admin left it blank → send only `invitationMethod:
        //     "native"` and let the server generate a fresh temp password.
        //     Sending an empty string would trip Zod's min(8) check.
        ...(linkExistingUserId
          ? { linkExistingUserId }
          : invitationMethod === "sso"
            ? { invitationMethod: "sso" }
            : {
                invitationMethod: "native",
                ...(password.trim().length > 0 ? { password: password.trim() } : {}),
              }),
        ...(appRoleId ? { appRoleId } : {}),
        // New shape — `projects` carries the role per project. Backend
        // also still accepts the legacy `projectIds: string[]` form for
        // forward-compat with anything else calling the same endpoint.
        ...(projectIds.length > 0
          ? {
              projects: projectIds.map((id) => ({
                projectId: id,
                projectRoleId: projectRoles[id] || undefined,
              })),
            }
          : {}),
      };
      const r = await fetch("/api/org/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      return j.data as { email: string; tempPassword?: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] });
      // If the server returned a plaintext temp password, switch the drawer
      // to the success view that reveals it once. Otherwise close.
      if (data?.tempPassword) {
        setCreatedTempPassword({
          email: data.email,
          tempPassword: data.tempPassword,
        });
      } else {
        onClose();
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  async function copyPassword() {
    if (!createdTempPassword) return;
    try {
      await navigator.clipboard.writeText(createdTempPassword.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked; user can still select+copy manually.
    }
  }

  // ── Success view — one-time plaintext temp-password reveal ──
  if (createdTempPassword) {
    return (
      <RightPanel
        open
        onClose={onClose}
        title="User invited"
        subtitle="Share the temporary password — shown only once"
        size="sm"
        footer={
          <RightPanelFooter>
            <Button onClick={onClose}>Done</Button>
          </RightPanelFooter>
        }
      >
        <p className="text-sm text-gray-600">
          A temporary password has been emailed to{" "}
          <span className="font-medium text-gray-900">
            {createdTempPassword.email}
          </span>
          . You can also share it manually below.
        </p>
        <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Temporary password
          </div>
          <div className="mt-1 break-all font-mono text-sm text-gray-900">
            {createdTempPassword.tempPassword}
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={copyPassword}>
            {copied ? "Copied!" : "Copy password"}
          </Button>
        </div>
      </RightPanel>
    );
  }

  const isLinking = !!linkExistingUserId;
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    // Native: leaving the password blank triggers the default-password seed,
    // so blank is fine. If admin DID type one, it must be ≥ 8 chars to be
    // accepted by the server (Zod min(8)).
    (isLinking ||
      invitationMethod === "sso" ||
      password.length === 0 ||
      password.length >= 8);

  const roles = rolesQ.data ?? [];
  const hits = searchQ.data ?? [];

  return (
    <RightPanel
      open
      onClose={onClose}
      title="Add User"
      subtitle={
        isLinking
          ? "Linking an existing org member — password not required"
          : "Invite a new member to the organisation"
      }
      size="sm"
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={() => mut.mutate()}
            label={mut.isPending ? "Adding…" : "Add User"}
            saving={mut.isPending}
            disabled={!canSubmit || mut.isPending}
          />
        </RightPanelFooter>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Jane"
          disabled={isLinking}
        />
        <Input
          label="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Doe"
          disabled={isLinking}
        />
      </div>

      {/* Email with typeahead */}
      <div ref={emailWrapRef} className="relative">
        <label className="block text-sm">
          <span className="text-gray-700 mb-1 block">Email</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (linkExistingUserId) setLinkExistingUserId(null);
                setShowHits(true);
              }}
              onFocus={() => !isLinking && setShowHits(true)}
              placeholder="jane@company.com"
              className={`w-full h-9 pl-9 pr-9 text-sm border rounded-md focus:outline-none focus:ring-1 ${
                isLinking
                  ? "border-blue-400 bg-blue-50 focus:ring-blue-400"
                  : "border-gray-200 focus:ring-blue-400"
              }`}
            />
            {isLinking && (
              <button
                type="button"
                onClick={clearLink}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-blue-100 text-blue-600"
                aria-label="Clear link"
                title="Clear and add as a new user"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </label>
        {isLinking && (
          <p className="mt-1 text-xs text-blue-700">
            Linking existing org member — password not required.
          </p>
        )}

        {showHits && !isLinking && debouncedEmail.length >= 2 && hits.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
            {hits.map((h) => (
              <button
                key={h.userId}
                type="button"
                disabled={h.hasQuikTrackAccess}
                onClick={() => pickHit(h)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm border-b border-gray-100 last:border-b-0 ${
                  h.hasQuikTrackAccess
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-blue-50"
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-[10px] font-semibold flex items-center justify-center">
                  {(h.firstName[0] ?? "?") + (h.lastName[0] ?? "")}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{h.firstName} {h.lastName}</span>
                  <span className="block text-xs text-gray-500 truncate">{h.email}</span>
                </span>
                {h.hasQuikTrackAccess ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Already in
                  </span>
                ) : (
                  <Check className="h-3.5 w-3.5 text-blue-600 opacity-0 group-hover:opacity-100" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Invitation Method — only when creating a brand-new user (hidden
          when linking an existing org member, since they already have an
          auth identity). */}
      {!isLinking && (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5">
            Invitation Method
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
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
            ]).map((opt) => {
              const active = invitationMethod === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setInvitationMethod(opt.key)}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`text-xs font-semibold ${
                      active ? "text-blue-700" : "text-gray-800"
                    }`}
                  >
                    {opt.title}
                  </div>
                  <div className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">
                    {opt.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Native callout — admin doesn't type a password on create. The
          server generates a unique temp password and the email embeds it.
          Per the reference UI, the password input is only available in
          edit mode (separate EditUserModal). Keeping this drawer
          purely about invite-and-go. */}
      {!isLinking && invitationMethod === "native" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[11.5px] text-blue-800 leading-snug">
          <strong className="font-semibold">Temporary password will be emailed.</strong>{" "}
          A unique temporary password will be generated and sent to the
          user&apos;s email. They&apos;ll be prompted to set a new password on
          first sign-in.
        </div>
      )}

      <Select
        label="Role"
        value={appRoleId}
        onChange={(e) => setAppRoleId(e.target.value)}
        options={[
          { value: "", label: "Use org default" },
          ...roles.map((r) => ({
            value: r.id,
            label: r.isDefault ? `${r.name} (default)` : r.name,
          })),
        ]}
      />

      <ProjectsPicker
        selected={projectIds}
        onChange={(ids) => {
          setProjectIds(ids);
          // Drop role choices for projects that were just unchecked so we
          // don't leak stale roleIds into the payload.
          setProjectRoles((prev) => {
            const next: Record<string, string> = {};
            for (const id of ids) if (prev[id]) next[id] = prev[id];
            return next;
          });
        }}
        label="Add to projects"
        placeholder="None — assign later"
      />

      {projectIds.length > 0 && (
        <ProjectRolesPicker
          projectIds={projectIds}
          value={projectRoles}
          onChange={setProjectRoles}
        />
      )}

      <p className="-mt-2 text-[11px] text-gray-400">
        Each project uses its own role catalogue. Leave a row on{" "}
        <span className="font-medium">Default</span> and the project&apos;s
        default role applies. Per-role permissions can be tuned later from
        the project&apos;s User Management page
        after invite.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </RightPanel>
  );
}

/* ─────────────────── Per-project role picker ─────────────────── */

interface ProjectMeta {
  id: string;
  name: string;
  projectKey: string;
  color?: string | null;
}

interface ProjectRoleOption {
  id: string;
  name: string;
  isDefault: boolean;
}

/**
 * Lists every project the admin has selected and, for each, lets them pick
 * a project role from THAT project's role catalogue. Roles are fetched per
 * project — cached by React Query so re-mounts are instant.
 *
 * Mirrors the QuikIT "Roles per Application" picker pattern but scoped to
 * the projects the new user is joining.
 */
function ProjectRolesPicker({
  projectIds,
  value,
  onChange,
}: {
  projectIds: string[];
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const projectsQ = useQuery({
    queryKey: ["quiktrack", "projects-picker"],
    queryFn: async () => {
      const r = await fetch("/api/projects?pageSize=200");
      const j = await r.json();
      // Inner ?? handles missing data; cast is the boundary between
      // `unknown` json and our typed shape. Trailing ?? [] was redundant
      // because the inner coalescing already guarantees an array.
      return (j.data ?? []) as ProjectMeta[];
    },
  });
  const projects = projectsQ.data ?? [];
  const projectById = new Map(projects.map((p) => [p.id, p] as const));

  return (
    <div className="block text-sm">
      <span className="text-gray-700 mb-1.5 block">Project roles</span>
      <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
        {projectIds.map((pid) => {
          const meta = projectById.get(pid);
          return (
            <ProjectRoleRow
              key={pid}
              projectId={pid}
              projectName={meta?.name ?? "—"}
              projectKey={meta?.projectKey ?? ""}
              projectColor={meta?.color ?? null}
              selectedRoleId={value[pid] ?? ""}
              onSelect={(rid) => {
                const next = { ...value };
                if (rid) next[pid] = rid;
                else delete next[pid];
                onChange(next);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProjectRoleRow({
  projectId,
  projectName,
  projectKey,
  projectColor,
  selectedRoleId,
  onSelect,
}: {
  projectId: string;
  projectName: string;
  projectKey: string;
  projectColor: string | null;
  selectedRoleId: string;
  onSelect: (roleId: string) => void;
}) {
  const rolesQ = useQuery({
    queryKey: ["quiktrack", "project-roles", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles`);
      const j = await r.json();
      return (j.data as ProjectRoleOption[]) ?? [];
    },
  });
  const roles = rolesQ.data ?? [];
  const defaultRole = roles.find((r) => r.isDefault);

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span
        className="h-5 w-5 rounded-sm shrink-0"
        style={{ background: projectColor ?? "#2563eb" }}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-gray-900 truncate">
          {projectName}
        </span>
        {projectKey && (
          <span className="block text-[10px] uppercase tracking-wider text-gray-400">
            {projectKey}
          </span>
        )}
      </span>
      <select
        value={selectedRoleId}
        onChange={(e) => onSelect(e.target.value)}
        className="h-8 px-2 text-[12.5px] border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[140px]"
      >
        <option value="">
          {defaultRole ? `Default (${defaultRole.name})` : "Default"}
        </option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
