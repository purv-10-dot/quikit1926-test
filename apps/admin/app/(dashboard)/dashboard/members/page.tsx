"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button, Input, Select, SlidePanel } from "@quikit/ui";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/constants";
import { formatRelativeDate } from "@/lib/utils";
import { UserPlus, Search, Loader2 } from "lucide-react";
import {
  DEFAULT_INVITE_PASSWORD,
  INVITE_METHOD,
  MEMBERSHIP_ROLES,
  validateSsoEmail,
} from "@quikit/shared";

interface OrgApp {
  id: string;
  name: string;
}

interface Member {
  id: string;
  membershipId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  role: string;
  status: string;
  teamNames: string[];
  lastSignInAt: string | null;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{
    email: string;
    firstName: string;
    lastName: string;
    role: typeof MEMBERSHIP_ROLES.APP_ADMIN | typeof MEMBERSHIP_ROLES.MEMBER;
    inviteMethod: typeof INVITE_METHOD.SSO | typeof INVITE_METHOD.NATIVE;
    appIds: string[];
  }>({
    email: "",
    firstName: "",
    lastName: "",
    role: MEMBERSHIP_ROLES.APP_ADMIN,
    inviteMethod: INVITE_METHOD.SSO,
    appIds: [],
  });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [orgApps, setOrgApps] = useState<OrgApp[]>([]);

  async function fetchMembers() {
    const res = await fetch("/api/members");
    const json = await res.json();
    if (json.success) {
      setMembers(json.data);
    }
    setLoading(false);
  }

  // FRD FR-OA-002 — the App Access dropdown lists only the apps this org has
  // been provisioned. Endpoint returns OrgAppAccess rows with enabled=true.
  async function fetchOrgApps() {
    try {
      const res = await fetch("/api/org/apps");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setOrgApps(json.data);
      }
    } catch {
      // Non-fatal — the form will just show no app options.
    }
  }

  useEffect(() => {
    fetchMembers();
    fetchOrgApps();
  }, []);

  function resetInviteForm() {
    setInviteForm({
      email: "",
      firstName: "",
      lastName: "",
      role: MEMBERSHIP_ROLES.APP_ADMIN,
      inviteMethod: INVITE_METHOD.SSO,
      appIds: [],
    });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError("");

    // FR-SA-004 — client-side SSO domain check so the user gets immediate
    // feedback. The server enforces the same rule.
    if (inviteForm.inviteMethod === INVITE_METHOD.SSO) {
      const err = validateSsoEmail(inviteForm.email);
      if (err) {
        setInviteError(err);
        setInviting(false);
        return;
      }
    }

    // FR-OA-002 — App Admin must have at least one app.
    if (
      inviteForm.role === MEMBERSHIP_ROLES.APP_ADMIN &&
      inviteForm.appIds.length === 0
    ) {
      setInviteError("Select at least one application for the App Admin.");
      setInviting(false);
      return;
    }

    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteForm),
    });

    const json = await res.json();
    if (json.success) {
      setInviteOpen(false);
      resetInviteForm();
      fetchMembers();
    } else {
      setInviteError(json.error || "Failed to send invitation");
    }
    setInviting(false);
  }

  function toggleAppId(id: string) {
    setInviteForm((prev) => ({
      ...prev,
      appIds: prev.appIds.includes(id)
        ? prev.appIds.filter((a) => a !== id)
        : [...prev.appIds, id],
    }));
  }

  const filtered = members.filter(
    (m) =>
      m.firstName.toLowerCase().includes(search.toLowerCase()) ||
      m.lastName.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Members</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Member
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Role
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Teams
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Last Active
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((member) => (
              <tr
                key={member.membershipId}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
                onClick={() => window.location.href = `/dashboard/members/${member.membershipId}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={member.avatar}
                      firstName={member.firstName}
                      lastName={member.lastName}
                      size="sm"
                    />
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {member.firstName} {member.lastName}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        {member.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={member.role}>
                    {ROLE_LABELS[member.role] || member.role}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={member.status}>{member.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {member.teamNames.length > 0
                      ? member.teamNames.join(", ")
                      : "No team"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-[var(--color-text-tertiary)]">
                    {member.lastSignInAt
                      ? formatRelativeDate(member.lastSignInAt)
                      : "Never"}
                  </p>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-text-tertiary)]">
                  No members found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <SlidePanel
        open={inviteOpen}
        onClose={() => { setInviteOpen(false); setInviteError(""); }}
        title="Invite Member"
        subtitle="Send an invitation to join the organization"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setInviteOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" form="invite-form" disabled={inviting} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">{inviting ? "Sending..." : "Send Invitation"}</button>
          </div>
        }
      >
        <form id="invite-form" onSubmit={handleInvite} className="space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Email</label>
            <input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">First Name</label>
              <input
                id="invite-first"
                placeholder="Jane"
                value={inviteForm.firstName}
                onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Last Name</label>
              <input
                id="invite-last"
                placeholder="Smith"
                value={inviteForm.lastName}
                onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
              />
            </div>
          </div>
          {/* FR-OA-001 — role dropdown is App Admin / User only. Org Admin
              and Super Admin cannot be assigned from here. */}
          <Select
            label="Role"
            value={inviteForm.role}
            onChange={(e) =>
              setInviteForm({
                ...inviteForm,
                role: e.target.value as typeof MEMBERSHIP_ROLES.APP_ADMIN | typeof MEMBERSHIP_ROLES.MEMBER,
              })
            }
            options={[
              { value: MEMBERSHIP_ROLES.APP_ADMIN, label: "App Admin" },
              { value: MEMBERSHIP_ROLES.MEMBER, label: "User" },
            ]}
          />

          {/* FR-OA-002 — Application Access multi-select. Required for App Admin
              (per superRefine in inviteMemberSchema). Optional for User per
              FR-OA-003 — apps may be assigned later from the member detail. */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">
              Application Access{" "}
              {inviteForm.role === MEMBERSHIP_ROLES.APP_ADMIN && (
                <span className="text-red-500">*</span>
              )}
            </label>
            {orgApps.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                No applications provisioned for this organisation.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {orgApps.map((app) => (
                  <label
                    key={app.id}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={inviteForm.appIds.includes(app.id)}
                      onChange={() => toggleAppId(app.id)}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-sm">{app.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* FR-SA-004 / FR-OA-001 — invitation method radio. Drives whether
              the invite email contains an SSO CTA or default credentials. */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">
              Invitation Method
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer">
                <input
                  type="radio"
                  name="invite-method"
                  value={INVITE_METHOD.SSO}
                  checked={inviteForm.inviteMethod === INVITE_METHOD.SSO}
                  onChange={() =>
                    setInviteForm({ ...inviteForm, inviteMethod: INVITE_METHOD.SSO })
                  }
                  className="mt-0.5 text-indigo-600"
                />
                <span className="text-sm">
                  <strong>SSO</strong> — sign in with Google or Microsoft
                </span>
              </label>
              <label className="flex items-start gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer">
                <input
                  type="radio"
                  name="invite-method"
                  value={INVITE_METHOD.NATIVE}
                  checked={inviteForm.inviteMethod === INVITE_METHOD.NATIVE}
                  onChange={() =>
                    setInviteForm({ ...inviteForm, inviteMethod: INVITE_METHOD.NATIVE })
                  }
                  className="mt-0.5 text-indigo-600"
                />
                <span className="text-sm">
                  <strong>Native Email</strong> — temporary password via email
                </span>
              </label>
            </div>
            {/* FR-SA-007 — show the system default password to the inviter
                so they can communicate it out-of-band if needed. */}
            {inviteForm.inviteMethod === INVITE_METHOD.NATIVE && (
              <p className="mt-2 text-xs text-gray-500">
                Temporary password sent in the email:{" "}
                <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">
                  {DEFAULT_INVITE_PASSWORD}
                </code>
                . The recipient will be prompted to set a new password on first login.
              </p>
            )}
          </div>

          {inviteError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {inviteError}
            </p>
          )}
        </form>
      </SlidePanel>
    </div>
  );
}
