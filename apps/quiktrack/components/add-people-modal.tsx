"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MoreHorizontal, X } from "lucide-react";
import { StyledSelect } from "@/app/(dashboard)/spaces/[id]/settings/user-management/_components/styled-select";
import { emitMembersChanged } from "@/lib/hooks/useMembersChanged";

interface ProjectRole {
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

interface ChipPerson {
  id: string;
  label: string;
  kind: "email" | "existing-user";
  userId?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  /** existing-user only: already has QuikTrack app access. When true we add
   *  them to *this project* via the project-members endpoint (no app-role or
   *  app-access side effects). When false we link them through /api/org/users
   *  which also grants app access. */
  hasAccess?: boolean;
}

/**
 * "Add people to <project>" — centred modal, Jira-style multi-invite chips.
 *
 * Each chip submits through the same /api/org/users pipeline as the Add User
 * drawer:
 *   - existing-user chip → `linkExistingUserId` (no password, no email)
 *   - plain-email chip   → new user creation; backend dispatches the
 *                          invitation email (Native = temp password,
 *                          SSO = first-sign-in flow)
 *
 * Constraints enforced for project-scoped invites:
 *   - App role: omitted from payload → server uses org default (Member tier)
 *   - Projects: `[{ projectId, projectRoleId? }]` — invitee is added to
 *     ONLY this space; project role defaults to the space's seeded default
 *     unless the inviter picked one.
 */
export function AddPeopleModal({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [people, setPeople] = useState<ChipPerson[]>([]);
  const [projectRoleId, setProjectRoleId] = useState("");
  const [invitationMethod, setInvitationMethod] = useState<"native" | "sso">("native");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [showHits, setShowHits] = useState(false);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 200);
    return () => clearTimeout(t);
  }, [input]);

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "project-roles", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles`);
      const j = await r.json();
      return (j.data as ProjectRole[]) ?? [];
    },
  });

  const searchQ = useQuery({
    queryKey: ["quiktrack", "user-search", debounced],
    queryFn: async () => {
      const r = await fetch(`/api/users/search?q=${encodeURIComponent(debounced)}&limit=8`);
      const j = await r.json();
      return (j.data as SearchResult[]) ?? [];
    },
    enabled: debounced.length >= 2,
  });

  // Current project members — used to mark people already in this space in the
  // typeahead (disabled, "already in" badge) and to block re-adding them by
  // typed email.
  // IMPORTANT: this query shares its cache entry with the space views
  // (backlog / board / timeline / …) which use the SAME key and store the
  // full member objects. Returning a reduced shape here would overwrite their
  // data on the next refetch (e.g. our own onSuccess invalidation), blanking
  // out the member avatars until a reload. So we return the same full shape
  // and derive the id / email sets we need below.
  const membersQ = useQuery({
    queryKey: ["quiktrack", "project-members", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/members`);
      const j = await r.json();
      const payload = j.data as
        | { members?: Array<{ userId: string; user: { email: string | null } | null }> }
        | Array<{ userId: string; user: { email: string | null } | null }>
        | null;
      return Array.isArray(payload) ? payload : payload?.members ?? [];
    },
  });

  const projectMemberIds = new Set((membersQ.data ?? []).map((m) => m.userId));
  const projectMemberEmails = new Set(
    (membersQ.data ?? [])
      .map((m) => (m.user?.email ?? "").toLowerCase())
      .filter(Boolean),
  );
  // Resolve a typed email back to a known org user (so we link/route them
  // correctly instead of treating them as a brand-new invite).
  const searchByEmail = new Map(
    (searchQ.data ?? []).map((h) => [h.email.toLowerCase(), h] as const),
  );

  async function commitTypedEmail() {
    const t = input.trim().replace(/[,;]\s*$/, "");
    if (!t) return;
    const parts = t.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    setInput("");
    setShowHits(false);

    const blocked: string[] = [];
    const toAdd: ChipPerson[] = [];
    for (const p of parts) {
      if (!/\S+@\S+\.\S+/.test(p)) continue;
      const lower = p.toLowerCase();
      // Already in this project — nothing to add.
      if (projectMemberEmails.has(lower)) {
        blocked.push(p);
        continue;
      }
      if (
        people.some((x) => x.email.toLowerCase() === lower) ||
        toAdd.some((x) => x.email.toLowerCase() === lower)
      ) {
        continue;
      }
      // Resolve the typed address to a known org user: cached search hits
      // first, then a direct lookup. This means a typed email belonging to an
      // existing member is LINKED (existing-user chip → no invitation method),
      // not treated as a brand-new invite.
      let hit = searchByEmail.get(lower);
      if (!hit) {
        try {
          const r = await fetch(
            `/api/users/search?q=${encodeURIComponent(p)}&limit=5`,
          ).then((res) => res.json());
          hit = ((r.data as SearchResult[]) ?? []).find(
            (u) => u.email.toLowerCase() === lower,
          );
        } catch {
          /* offline / failed → fall through to a new-email chip */
        }
      }
      if (hit && projectMemberIds.has(hit.userId)) {
        blocked.push(p);
        continue;
      }
      if (hit) {
        toAdd.push({
          id: `u:${hit.userId}`,
          label: `${hit.firstName} ${hit.lastName}`.trim() || hit.email,
          kind: "existing-user",
          userId: hit.userId,
          firstName: hit.firstName,
          lastName: hit.lastName,
          email: hit.email,
          hasAccess: hit.hasQuikTrackAccess,
        });
      } else {
        toAdd.push({ id: `e:${p}`, label: p, kind: "email", email: p });
      }
    }

    if (toAdd.length) {
      setPeople((cur) => {
        const next = [...cur];
        for (const c of toAdd) {
          if (!next.some((x) => x.email.toLowerCase() === c.email.toLowerCase())) next.push(c);
        }
        return next;
      });
    }
    if (blocked.length) {
      setError(`${blocked.join(", ")} ${blocked.length > 1 ? "are" : "is"} already in this project.`);
    }
  }

  function addExistingUser(h: SearchResult) {
    // Already a member of this project — nothing to add (row is disabled too).
    if (projectMemberIds.has(h.userId)) return;
    setPeople((cur) => {
      if (cur.some((x) => x.userId === h.userId || x.email.toLowerCase() === h.email.toLowerCase())) return cur;
      return [
        ...cur,
        {
          id: `u:${h.userId}`,
          label: `${h.firstName} ${h.lastName}`.trim() || h.email,
          kind: "existing-user",
          userId: h.userId,
          firstName: h.firstName,
          lastName: h.lastName,
          email: h.email,
          hasAccess: h.hasQuikTrackAccess,
        },
      ];
    });
    setInput("");
    setShowHits(false);
  }

  function removeChip(id: string) {
    setPeople((cur) => cur.filter((x) => x.id !== id));
  }

  function deriveName(emailAddr: string): { firstName: string; lastName: string } {
    const local = emailAddr.split("@")[0] ?? "User";
    const parts = local.split(/[._-]+/).filter(Boolean);
    const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
    if (parts.length >= 2) return { firstName: cap(parts[0]), lastName: cap(parts.slice(1).join(" ")) };
    return { firstName: cap(parts[0] ?? "User"), lastName: "—" };
  }

  const mut = useMutation({
    mutationFn: async () => {
      const failures: string[] = [];
      for (const p of people) {
        // Existing app member → add to THIS project only via the project
        // members endpoint. Scope stays project-local: no app access or
        // app-role rows are touched. The upsert is idempotent, so re-adding
        // someone already in the project is harmless.
        if (p.kind === "existing-user" && p.userId && p.hasAccess) {
          const r = await fetch(`/api/projects/${projectId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: p.userId }),
          });
          const j = await r.json();
          if (!r.ok) {
            failures.push(`${p.email}: ${j.error ?? "Failed"}`);
            continue;
          }
          if (projectRoleId) {
            const rr = await fetch(`/api/projects/${projectId}/members/${p.userId}/role`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectRoleId }),
            });
            if (!rr.ok) {
              failures.push(`${p.email}: ${(await rr.json()).error ?? "Failed to set role"}`);
            }
          }
          continue;
        }

        // New email, or existing org member without app access → go through
        // /api/org/users, which grants QuikTrack access and adds to the project.
        const body: Record<string, unknown> = {
          projects: [
            { projectId, ...(projectRoleId ? { projectRoleId } : {}) },
          ],
        };
        if (p.kind === "existing-user" && p.userId) {
          body.firstName = p.firstName ?? "";
          body.lastName = p.lastName ?? "—";
          body.email = p.email;
          body.linkExistingUserId = p.userId;
        } else {
          const { firstName, lastName } = deriveName(p.email);
          body.firstName = firstName;
          body.lastName = lastName;
          body.email = p.email;
          body.invitationMethod = invitationMethod;
        }
        const r = await fetch("/api/org/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (!r.ok) failures.push(`${p.email}: ${j.error ?? "Failed"}`);
      }
      if (failures.length) throw new Error(failures.join(" · "));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] });
      // Nudge the open board / backlog / etc. views (they cache members in
      // local state, outside React Query) to refetch without a reload.
      emitMembersChanged(projectId);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  // Keep people already in the project in the list — they render disabled with
  // an "already in" badge so it's clear why they can't be picked. Just drop the
  // ones already added as chips.
  const hits = (searchQ.data ?? []).filter(
    (h) => !people.some((x) => x.userId === h.userId || x.email.toLowerCase() === h.email.toLowerCase()),
  );
  // A chip is "already in" when its user id or email matches a current project
  // member. Belt-and-suspenders against chips that slipped in before the member
  // list finished loading (the add-time guards can't see data that wasn't there
  // yet). Such chips block submission until removed.
  const chipInProject = (p: ChipPerson) =>
    (p.userId ? projectMemberIds.has(p.userId) : false) ||
    projectMemberEmails.has(p.email.toLowerCase());
  const hasBlockedChip = people.some(chipInProject);

  const canSubmit = people.length > 0 && !hasBlockedChip && !mut.isPending;
  const roles = rolesQ.data ?? [];

  // The Native/SSO invitation method only governs how a brand-new account is
  // created + emailed. Existing org members are linked silently, so only show
  // the picker when at least one chip is a new email address.
  const needsInvitationMethod = people.some((p) => p.kind === "email" && !chipInProject(p));

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-4">
          <h3 className="text-base font-semibold text-gray-900 leading-snug">
            Add people to {projectName}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            {/* <button
              type="button"
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
              aria-label="More"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button> */}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Names or emails — chip input + typeahead */}
        <div ref={wrapRef} className="relative">
          <span className="text-xs font-semibold text-gray-700 block mb-1">
            Names or emails <span className="text-red-500">*</span>
          </span>
          <div
            className={`min-h-[36px] w-full px-2 py-1 flex flex-wrap items-center gap-1.5 border rounded-md bg-white ${
              showHits ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-300"
            }`}
            onClick={() => inputRef.current?.focus()}
          >
            {people.map((p) => {
              const blocked = chipInProject(p);
              return (
              <span
                key={p.id}
                title={blocked ? "Already in this project" : undefined}
                className={`inline-flex items-center gap-1.5 h-6 pl-1 pr-1.5 text-xs rounded-full ${
                  blocked
                    ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <span
                  className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                  style={{ background: avatarColor(p.label) }}
                >
                  {(p.label.charAt(0) || "?").toUpperCase()}
                </span>
                {p.label}
                <button
                  type="button"
                  onClick={() => removeChip(p.id)}
                  className={blocked ? "text-red-400 hover:text-red-600" : "text-gray-400 hover:text-gray-600"}
                  aria-label={`Remove ${p.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
              );
            })}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setShowHits(true);
              }}
              onFocus={() => setShowHits(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTypedEmail();
                }
                if (e.key === "Backspace" && input === "" && people.length > 0) {
                  setPeople((cur) => cur.slice(0, -1));
                }
              }}
              onBlur={() => setTimeout(() => commitTypedEmail(), 100)}
              placeholder={people.length === 0 ? "e.g., Maria, maria@company.com" : ""}
              className="flex-1 min-w-[140px] h-7 text-sm outline-none bg-transparent"
            />
          </div>

          {showHits && debounced.length >= 2 && hits.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
              {hits.map((h) => {
                const inProject = projectMemberIds.has(h.userId);
                return (
                <button
                  key={h.userId}
                  type="button"
                  disabled={inProject}
                  // Keep the input focused so its onBlur (commitTypedEmail)
                  // doesn't close the dropdown before this click registers.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addExistingUser(h)}
                  className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm border-b border-gray-100 last:border-b-0 ${
                    inProject ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-50"
                  }`}
                >
                  <span
                    className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                    style={{ background: avatarColor(h.email) }}
                  >
                    {(h.firstName[0] ?? "?") + (h.lastName[0] ?? "")}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{h.firstName} {h.lastName}</span>
                    <span className="block text-xs text-gray-500 truncate">{h.email}</span>
                  </span>
                  {inProject ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 shrink-0">
                      {h.hasQuikTrackAccess ? "Already in app & project" : "Already in project"}
                    </span>
                  ) : h.hasQuikTrackAccess ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 shrink-0">
                      In app · add to project
                    </span>
                  ) : (
                    <Check className="h-3.5 w-3.5 text-blue-600 opacity-60 shrink-0" />
                  )}
                </button>
                );
              })}
            </div>
          )}
          {hasBlockedChip && (
            <p className="mt-1.5 text-[11px] text-red-600">
              Highlighted people are already in this project — remove them to continue.
            </p>
          )}
        </div>

        {/* External providers (visual only) */}
        {/* <div className="mt-4">
          <div className="text-xs text-gray-500 mb-2">or add from</div>
          <div className="grid grid-cols-3 gap-2">
            <ProviderButton label="Google" />
            <ProviderButton label="Slack" />
            <ProviderButton label="Microsoft" />
          </div>
        </div> */}

        {/* Invitation method — only relevant when inviting brand-new emails. */}
        {needsInvitationMethod && (
        <div className="mt-4">
          <span className="text-xs font-semibold text-gray-700 block mb-1.5">
            Invitation method
          </span>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "native" as const, title: "Native", hint: "Email + temp password" },
              { key: "sso" as const, title: "SSO", hint: "Google / Microsoft" },
            ]).map((opt) => {
              const active = invitationMethod === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setInvitationMethod(opt.key)}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className={`text-xs font-semibold ${active ? "text-blue-700" : "text-gray-800"}`}>
                    {opt.title}
                  </div>
                  <div className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">{opt.hint}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10.5px] text-gray-400">
            Only applies to new emails. Existing org members are emailed that they were added to this project.
          </p>
        </div>
        )}

        {/* Role — this project's roles only */}
        <div className="mt-4">
          <span className="text-xs font-semibold text-gray-700 block mb-1.5">
            Role <span className="text-red-500">*</span>
          </span>
          <StyledSelect
            value={projectRoleId}
            onChange={setProjectRoleId}
            placeholder="Use project default"
            options={[
              { value: "", label: "Use project default", sub: "Whatever this space marks as default" },
              ...roles.map((r) => ({
                value: r.id,
                label: r.name,
                sub: r.isDefault ? "Default for new members" : undefined,
              })),
            ]}
          />
        </div>

        <p className="mt-3 text-[11px] text-gray-500 leading-snug">
          Invitees join the org as <span className="font-medium">Member</span> and
          are added to <span className="font-medium">{projectName}</span> only.
        </p>

        {error && (
          <div className="mt-3 px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-sm text-gray-700 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={!canSubmit}
            className="h-8 px-3 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            {mut.isPending ? "Sending…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProviderButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-2 h-9 px-3 text-sm text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
    >
      <span className="h-4 w-4 rounded-sm" style={{ background: providerColor(label) }} />
      {label}
    </button>
  );
}

function providerColor(label: string): string {
  if (label === "Google") return "#4285F4";
  if (label === "Slack") return "#611f69";
  if (label === "Microsoft") return "#00A4EF";
  return "#888";
}

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}
