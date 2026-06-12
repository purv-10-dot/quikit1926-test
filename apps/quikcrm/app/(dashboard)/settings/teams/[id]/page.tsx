"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Pencil,
  UserPlus,
  Link2,
  X,
  Users,
  Shield,
  FolderOpen,
  LayoutDashboard,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface TeamMember {
  userId: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

interface TeamGroup {
  id: string;
  name: string;
  memberCount: number;
  managerCount: number;
  accountCount: number;
}

interface TeamDetail {
  id: string;
  name: string;
  managerId: string | null;
  managers: TeamMember[];
  members: TeamMember[];
  groups: TeamGroup[];
}

interface GroupOption {
  id: string;
  name: string;
  _count: { members: number; managers: number; accounts: number };
}

type Tab = "overview" | "members" | "managers" | "groups";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TeamDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const toast = useToast();

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [allGroups, setAllGroups] = useState<GroupOption[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addManagersOpen, setAddManagersOpen] = useState(false);
  const [linkGroupOpen, setLinkGroupOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [t, u, g] = await Promise.all([
      fetch(`/api/settings/teams/${id}`, { credentials: "include" }).then((r) => r.json()),
      fetch("/api/settings/users?pageSize=200", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/settings/sales-groups", { credentials: "include" }).then((r) => r.json()),
    ]);
    if (t && !t.error) setTeam(t as TeamDetail);
    setUsers(Array.isArray(u?.items) ? u.items : []);
    setAllGroups(Array.isArray(g?.items) ? g.items : []);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function removeMember(userId: string) {
    const res = await fetch(`/api/settings/teams/${id}/members`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      toast.error("Remove failed");
      return;
    }
    refresh();
  }

  async function removeManager(userId: string) {
    const res = await fetch(`/api/settings/teams/${id}/managers`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      toast.error("Remove failed");
      return;
    }
    refresh();
  }

  async function unlinkGroup(groupId: string) {
    const res = await fetch(`/api/settings/teams/${id}/groups`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
    if (!res.ok) {
      toast.error("Unlink failed");
      return;
    }
    refresh();
  }

  if (!team) {
    return <p className="p-8 text-sm text-crm-muted">Loading…</p>;
  }

  const memberUserIds = new Set(team.members.map((m) => m.userId));
  const managerUserIds = new Set(team.managers.map((m) => m.userId));
  const linkedGroupIds = new Set(team.groups.map((g) => g.id));
  const totalAccounts = team.groups.reduce((sum, g) => sum + g.accountCount, 0);

  const availableGroups = allGroups.filter((g) => !linkedGroupIds.has(g.id));
  const addableMembers = users.filter((u) => !memberUserIds.has(u.id));
  const addableManagers = users.filter((u) => !managerUserIds.has(u.id));

  const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
    { key: "members", label: `Members (${team.members.length})`, icon: <Users size={14} /> },
    { key: "managers", label: `Managers (${team.managers.length})`, icon: <Shield size={14} /> },
    { key: "groups", label: `Sales Groups (${team.groups.length})`, icon: <FolderOpen size={14} /> },
  ];

  return (
    <div>
      <Link
        href="/settings/teams"
        className="mb-3 inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
      >
        <ChevronLeft size={14} /> All teams
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-crm-text">{team.name}</h1>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          <Pencil size={14} /> Edit
        </Button>
      </div>

      {/* Tab navigation */}
      <nav className="mb-6 flex border-b border-crm-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-accent-600 text-accent-700"
                : "text-crm-muted hover:text-crm-text"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Managers" value={team.managers.length} />
          <StatCard label="Members" value={team.members.length} />
          <StatCard label="Sales Groups" value={team.groups.length} />
          <StatCard label="Total Accounts" value={totalAccounts} />
          {team.managers.length > 0 && (
            <Card className="sm:col-span-2 lg:col-span-4">
              <CardHeader>
                <CardTitle>Team Managers</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="flex flex-wrap gap-3">
                  {team.managers.map((m) => (
                    <li
                      key={m.userId}
                      className="flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1 text-sm text-accent-700"
                    >
                      <Shield size={12} />
                      {m.user
                        ? `${m.user.firstName} ${m.user.lastName}`
                        : m.userId}
                      {m.userId === team.managerId && (
                        <span className="ml-1 text-xs text-accent-500">(primary)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {team.groups.length > 0 && (
            <Card className="sm:col-span-2 lg:col-span-4">
              <CardHeader>
                <CardTitle>Linked Sales Groups</CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-crm-border">
                  {team.groups.map((g) => (
                    <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-medium">{g.name}</span>
                      <span className="text-crm-muted">
                        {g.memberCount} member{g.memberCount !== 1 ? "s" : ""} ·{" "}
                        {g.accountCount} account{g.accountCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === "members" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-crm-muted">
              Users listed here count toward TeamManager assignment scope and reporting.
            </p>
            <Button variant="secondary" onClick={() => setAddMembersOpen(true)}>
              <UserPlus size={14} /> Add Member
            </Button>
          </div>
          <Card>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Email</TH>
                    <TH className="w-12"></TH>
                  </TR>
                </THead>
                <TBody>
                  {team.members.length === 0 ? (
                    <TR>
                      <TD colSpan={3} className="py-8 text-center text-crm-muted">
                        No members yet. Add users to this team.
                      </TD>
                    </TR>
                  ) : (
                    team.members.map((m) => (
                      <TR key={m.userId}>
                        <TD className="font-medium">
                          {m.user ? `${m.user.firstName} ${m.user.lastName}` : m.userId}
                        </TD>
                        <TD className="text-crm-muted">{m.user?.email ?? "—"}</TD>
                        <TD>
                          <button
                            onClick={() => removeMember(m.userId)}
                            className="rounded p-1.5 text-crm-muted hover:bg-red-50 hover:text-red-600"
                            aria-label="Remove member"
                          >
                            <X size={14} />
                          </button>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Managers tab */}
      {tab === "managers" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-crm-muted">
              Managers have TeamManager-scoped access to all data across this team's groups.
            </p>
            <Button variant="secondary" onClick={() => setAddManagersOpen(true)}>
              <Shield size={14} /> Add Manager
            </Button>
          </div>
          <Card>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Email</TH>
                    <TH>Role</TH>
                    <TH className="w-12"></TH>
                  </TR>
                </THead>
                <TBody>
                  {team.managers.length === 0 ? (
                    <TR>
                      <TD colSpan={4} className="py-8 text-center text-crm-muted">
                        No managers assigned. Add a manager to give TeamManager access.
                      </TD>
                    </TR>
                  ) : (
                    team.managers.map((m) => (
                      <TR key={m.userId}>
                        <TD className="font-medium">
                          {m.user ? `${m.user.firstName} ${m.user.lastName}` : m.userId}
                        </TD>
                        <TD className="text-crm-muted">{m.user?.email ?? "—"}</TD>
                        <TD>
                          {m.userId === team.managerId ? (
                            <span className="inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700">
                              Primary
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                              Manager
                            </span>
                          )}
                        </TD>
                        <TD>
                          <button
                            onClick={() => removeManager(m.userId)}
                            className="rounded p-1.5 text-crm-muted hover:bg-red-50 hover:text-red-600"
                            aria-label="Remove manager"
                          >
                            <X size={14} />
                          </button>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Sales Groups tab */}
      {tab === "groups" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-crm-muted">
              Linked groups give team managers visibility into all accounts in those groups.
            </p>
            <Button variant="secondary" onClick={() => setLinkGroupOpen(true)}>
              <Link2 size={14} /> Link Group
            </Button>
          </div>
          <Card>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Group Name</TH>
                    <TH className="text-right">Members</TH>
                    <TH className="text-right">Accounts</TH>
                    <TH className="w-12"></TH>
                  </TR>
                </THead>
                <TBody>
                  {team.groups.length === 0 ? (
                    <TR>
                      <TD colSpan={4} className="py-8 text-center text-crm-muted">
                        No sales groups linked. Link a group to define the data scope.
                      </TD>
                    </TR>
                  ) : (
                    team.groups.map((g) => (
                      <TR key={g.id}>
                        <TD className="font-medium">{g.name}</TD>
                        <TD className="text-right">{g.memberCount}</TD>
                        <TD className="text-right">{g.accountCount}</TD>
                        <TD>
                          <button
                            onClick={() => unlinkGroup(g.id)}
                            className="rounded p-1.5 text-crm-muted hover:bg-red-50 hover:text-red-600"
                            aria-label="Unlink group"
                          >
                            <X size={14} />
                          </button>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Edit team modal */}
      {editOpen && (
        <EditTeamModal
          team={team}
          users={users}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            refresh();
            setEditOpen(false);
          }}
        />
      )}

      {/* Add members modal */}
      {addMembersOpen && (
        <AddUsersModal
          title="Add Members"
          teamId={id}
          endpoint="members"
          candidates={addableMembers}
          onClose={() => setAddMembersOpen(false)}
          onSaved={() => {
            refresh();
            setAddMembersOpen(false);
          }}
        />
      )}

      {/* Add managers modal */}
      {addManagersOpen && (
        <AddUsersModal
          title="Add Managers"
          teamId={id}
          endpoint="managers"
          candidates={addableManagers}
          onClose={() => setAddManagersOpen(false)}
          onSaved={() => {
            refresh();
            setAddManagersOpen(false);
          }}
        />
      )}

      {/* Link group modal */}
      {linkGroupOpen && (
        <LinkGroupModal
          teamId={id}
          available={availableGroups}
          onClose={() => setLinkGroupOpen(false)}
          onSaved={() => {
            refresh();
            setLinkGroupOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardBody className="py-4">
        <p className="text-2xl font-semibold text-crm-text">{value}</p>
        <p className="mt-0.5 text-sm text-crm-muted">{label}</p>
      </CardBody>
    </Card>
  );
}

function EditTeamModal({
  team,
  users,
  onClose,
  onSaved,
}: {
  team: TeamDetail;
  users: UserRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(team.name);
  const [managerId, setManagerId] = useState(team.managerId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/teams/${team.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), managerId: managerId || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      toast.success("Team updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Edit: ${team.name}`}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">Name *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Primary Manager</span>
          <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Modal>
  );
}

function AddUsersModal({
  title,
  teamId,
  endpoint,
  candidates,
  onClose,
  onSaved,
}: {
  title: string;
  teamId: string;
  endpoint: "members" | "managers";
  candidates: UserRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (selected.length === 0) {
      toast.error("Select at least one user");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/teams/${teamId}/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      toast.success("Added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={title}>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-crm-border">
        {candidates.length === 0 ? (
          <p className="px-3 py-4 text-sm text-crm-muted">All users have already been added.</p>
        ) : (
          <ul>
            {candidates.map((u) => (
              <li key={u.id} className="border-b border-crm-border last:border-0">
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-crm-panel">
                  <input
                    type="checkbox"
                    checked={selected.includes(u.id)}
                    onChange={() => toggle(u.id)}
                    className="accent-accent-600"
                  />
                  <span className="font-medium">
                    {u.firstName} {u.lastName}
                  </span>
                  <span className="text-crm-muted">{u.email}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || selected.length === 0}>
          {saving ? "Adding…" : `Add ${selected.length > 0 ? selected.length : ""}`}
        </Button>
      </div>
    </Modal>
  );
}

function LinkGroupModal({
  teamId,
  available,
  onClose,
  onSaved,
}: {
  teamId: string;
  available: GroupOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [groupId, setGroupId] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!groupId) {
      toast.error("Select a group");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/teams/${teamId}/groups`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      toast.success("Group linked");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Link Sales Group">
      <div className="space-y-3 text-sm">
        <p className="text-crm-muted">
          Linking a group gives team managers visibility into all accounts in that group.
          A group can only belong to one team at a time.
        </p>
        <label className="block">
          <span className="mb-1 block font-medium">Sales Group *</span>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">— Select a group —</option>
            {available.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g._count.members} members · {g._count.accounts} accounts)
              </option>
            ))}
          </Select>
        </label>
        {available.length === 0 && (
          <p className="text-sm text-amber-600">
            All sales groups are already linked to teams.
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || !groupId}>
          {saving ? "Linking…" : "Link Group"}
        </Button>
      </div>
    </Modal>
  );
}
