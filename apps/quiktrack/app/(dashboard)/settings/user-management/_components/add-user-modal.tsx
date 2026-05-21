"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  Input,
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
        //     "native"` and let the server seed DEFAULT_INVITE_PASSWORD.
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

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
          server seeds DEFAULT_INVITE_PASSWORD and the email embeds it.
          Per the reference UI, the password input is only available in
          edit mode (separate EditUserModal). Keeping this drawer
          purely about invite-and-go. */}
      {!isLinking && invitationMethod === "native" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-[11.5px] text-blue-800 leading-snug">
          <strong className="font-semibold">Temporary password will be emailed.</strong>{" "}
          The user will receive{" "}
          <span className="font-mono font-semibold">Quikit2026</span> at their
          email and be prompted to set a new password on first sign-in.
        </div>
      )}

      <div className="block text-sm">
        <span className="text-gray-700 mb-1.5 block">Role</span>
        <CustomSelect
          value={appRoleId}
          onChange={setAppRoleId}
          placeholder="Use org default"
          options={[
            { value: "", label: "Use org default" },
            ...roles.map((r) => ({
              value: r.id,
              label: r.name,
              badge: r.isDefault ? "default" : undefined,
            })),
          ]}
        />
      </div>

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
      <div className="shrink-0" style={{ minWidth: 180 }}>
        <CustomSelect
          value={selectedRoleId}
          onChange={onSelect}
          size="sm"
          width={180}
          placeholder="Use project default"
          options={[
            { value: "", label: "Use project default" },
            ...roles.map((r) => ({
              value: r.id,
              label: r.name,
              badge: r.isDefault ? "default" : undefined,
            })),
          ]}
        />
      </div>
    </div>
  );
}

/* ─────────────────── CustomSelect ───────────────────
 * Lightweight popover-style select used for the Role + per-project role
 * pickers. Builds on the same portal/auto-flip pattern as RolePill so the
 * menu can escape any overflow-hidden parent (e.g. the RightPanel body).
 *
 * Why not the native <select>? Browser-rendered option lists can't pick up
 * Tailwind tokens — font, padding, hover, active row colour are all OS
 * controlled — so the two pickers always looked off vs the rest of the
 * drawer. This component owns the rendering top to bottom.
 */
interface CustomSelectOption {
  value: string;
  label: string;
  badge?: string; // e.g. "default" — rendered as a tiny chip on the row
}

function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  size = "md",
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  size?: "sm" | "md";
  /** Optional min-width override for the trigger; menu matches the trigger. */
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuHeight = Math.min(320, options.length * 36 + 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 16 && rect.top > menuHeight + 16;
    setCoords({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : placeholder;

  const heightCls = size === "sm" ? "h-8 text-[12.5px]" : "h-9 text-[13px]";

  const menu =
    open && coords && typeof window !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              minWidth: coords.width,
              zIndex: 1100,
            }}
            className="bg-white border border-gray-200 rounded-lg shadow-[0_12px_32px_-10px_rgba(15,23,42,0.18),0_4px_12px_-4px_rgba(15,23,42,0.08)] overflow-hidden py-1 max-h-[20rem] overflow-y-auto"
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.badge && (
                      <span className="text-[9px] uppercase tracking-wider text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {opt.badge}
                      </span>
                    )}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })}
            {options.length === 0 && (
              <p className="px-3 py-3 text-xs text-gray-400">No options.</p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={width ? { minWidth: width } : undefined}
        className={`w-full ${heightCls} pl-3 pr-9 inline-flex items-center justify-between text-left border rounded-md transition-colors relative cursor-pointer ${
          open
            ? "border-blue-400 bg-white ring-1 ring-blue-300"
            : "border-gray-200 bg-white hover:bg-gray-50"
        }`}
      >
        <span
          className={`truncate ${selected ? "text-gray-800" : "text-gray-500"}`}
        >
          {label}
        </span>
        <ChevronDown
          className={`absolute right-3 h-3.5 w-3.5 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {menu}
    </>
  );
}
