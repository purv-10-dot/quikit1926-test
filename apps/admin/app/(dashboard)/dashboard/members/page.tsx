"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { ROLE_LABELS } from "@/lib/constants";
import { formatRelativeDate } from "@/lib/utils";
import { UserPlus, Search, Loader2 } from "lucide-react";

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
  const [inviteForm, setInviteForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "employee",
  });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  async function fetchMembers() {
    const res = await fetch("/api/members");
    const json = await res.json();
    if (json.success) {
      setMembers(json.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchMembers();
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError("");

    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inviteForm),
    });

    const json = await res.json();
    if (json.success) {
      setInviteOpen(false);
      setInviteForm({ email: "", firstName: "", lastName: "", role: "employee" });
      fetchMembers();
    } else {
      setInviteError(json.error || "Failed to send invitation");
    }
    setInviting(false);
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

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <Input
            id="invite-email"
            label="Email"
            type="email"
            placeholder="colleague@company.com"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="invite-first"
              label="First Name"
              placeholder="Jane"
              value={inviteForm.firstName}
              onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
              required
            />
            <Input
              id="invite-last"
              label="Last Name"
              placeholder="Smith"
              value={inviteForm.lastName}
              onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
              Role
            </label>
            <select
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
            >
              <option value="employee">Employee</option>
              <option value="coach">Coach</option>
              <option value="manager">Manager</option>
              <option value="executive">Executive</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {inviteError && (
            <p className="text-sm text-[var(--color-danger)]">{inviteError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={inviting}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
