"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button, Input, Select, SlidePanel, useConfirm } from "@quikit/ui";
import { Avatar } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  FolderTree,
  Search,
} from "lucide-react";

interface TeamDetail {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  color: string | null;
  headId: string | null;
  headName: string | null;
  parentTeamId: string | null;
  parentTeamName: string | null;
  childTeams: { id: string; name: string; color: string | null }[];
  memberCount: number;
  members: { id: string; firstName: string; lastName: string; email: string; avatar: string | null }[];
}

interface OrgMember {
  id: string;
  membershipId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
}

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", color: "", headId: "" });

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");

  async function fetchTeam() {
    const res = await fetch(`/api/teams/${params.id}`);
    const json = await res.json();
    if (json.success) {
      setTeam(json.data);
      setEditForm({
        name: json.data.name,
        description: json.data.description || "",
        color: json.data.color || "#6366f1",
        headId: json.data.headId || "",
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/teams/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description || null,
        color: editForm.color,
        headId: editForm.headId || null,
      }),
    });
    await fetchTeam();
    setEditing(false);
    setSaving(false);
  }

  async function handleDelete() {
    if (!(await confirm({ title: `Delete team "${team?.name}"?`, description: "This cannot be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    const res = await fetch(`/api/teams/${params.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      router.push("/dashboard/teams");
    } else {
      alert(json.error || "Failed to delete");
    }
  }

  async function openAddMember() {
    setAddMemberOpen(true);
    const res = await fetch("/api/members");
    const json = await res.json();
    if (json.success) setOrgMembers(json.data);
  }

  async function addMember(userId: string) {
    await fetch(`/api/teams/${params.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await fetchTeam();
    setAddMemberOpen(false);
  }

  async function removeMember(userId: string) {
    if (!(await confirm({ title: "Remove this member from the team?", description: "They will lose team access. You can add them back later.", confirmLabel: "Remove", tone: "danger" }))) return;
    await fetch(`/api/teams/${params.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await fetchTeam();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  if (!team) {
    return <p className="text-[var(--color-text-secondary)]">Team not found</p>;
  }

  const availableMembers = orgMembers.filter(
    (m) =>
      !team.members.find((tm) => tm.id === m.id) &&
      (m.firstName.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.lastName.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.email.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  return (
    <div>
      <button
        onClick={() => router.push("/dashboard/teams")}
        className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Teams
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team info */}
        <Card className="lg:col-span-1">
          {editing ? (
            <div className="space-y-4">
              <Input
                id="edit-name"
                label="Team Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--color-text-primary)]">Color</label>
                <input
                  type="color"
                  value={editForm.color}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  className="h-10 w-10 rounded-lg border border-[var(--color-border)] cursor-pointer"
                />
              </div>
              <Select
                label="Team Lead"
                value={editForm.headId}
                onChange={(e) => setEditForm({ ...editForm, headId: e.target.value })}
                options={[
                  { value: "", label: "No lead assigned" },
                  ...team.members.map((m) => ({
                    value: m.id,
                    label: `${m.firstName} ${m.lastName}`,
                  })),
                ]}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: team.color || "#6366f1" }}
                >
                  {team.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {team.name}
                  </h2>
                  {team.headName && (
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      Lead: {team.headName}
                    </p>
                  )}
                </div>
              </div>
              {team.description && (
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                  {team.description}
                </p>
              )}
              {team.parentTeamName && (
                <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
                  Parent: {team.parentTeamName}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="danger" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {/* Members */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Members ({team.memberCount})
              </h3>
              <Button size="sm" variant="outline" onClick={openAddMember}>
                <UserPlus className="h-3.5 w-3.5" /> Add Member
              </Button>
            </div>
            {team.members.length > 0 ? (
              <div className="space-y-2">
                {team.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar src={m.avatar} firstName={m.firstName} lastName={m.lastName} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">{m.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeMember(m.id)}
                      className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-tertiary)]">No members in this team</p>
            )}
          </Card>

          {/* Child teams */}
          {team.childTeams.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
                Sub-teams ({team.childTeams.length})
              </h3>
              <div className="space-y-2">
                {team.childTeams.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => router.push(`/dashboard/teams/${child.id}`)}
                    className="w-full flex items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 hover:bg-[var(--color-bg-secondary)] transition-colors text-left"
                  >
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                      style={{ backgroundColor: child.color || "#6366f1" }}
                    >
                      {child.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {child.name}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Add member panel */}
      <SlidePanel
        open={addMemberOpen}
        onClose={() => { setAddMemberOpen(false); setMemberSearch(""); }}
        title="Add Team Member"
        subtitle="Search and add a member to this team"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search members..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="w-full pl-9 pr-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {availableMembers.length > 0 ? (
              availableMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addMember(m.id)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                >
                  <Avatar src={m.avatar} firstName={m.firstName} lastName={m.lastName} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {m.firstName} {m.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                No available members to add
              </p>
            )}
          </div>
        </div>
      </SlidePanel>
    </div>
  );
}
