"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  FolderTree,
  Plus,
  Users,
  ChevronRight,
  Loader2,
  Search,
} from "lucide-react";

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  headId: string | null;
  headName: string | null;
  parentTeamId: string | null;
  parentTeamName: string | null;
  childTeams: { id: string; name: string; color: string | null }[];
  memberCount: number;
  members: { id: string; firstName: string; lastName: string; avatar: string | null }[];
  createdAt: string;
}

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    color: "#6366f1",
    parentTeamId: "",
  });

  async function fetchTeams() {
    const res = await fetch("/api/teams");
    const json = await res.json();
    if (json.success) setTeams(json.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchTeams();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");

    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        color: form.color,
        parentTeamId: form.parentTeamId || null,
      }),
    });

    const json = await res.json();
    if (json.success) {
      setCreateOpen(false);
      setForm({ name: "", description: "", color: "#6366f1", parentTeamId: "" });
      fetchTeams();
    } else {
      setCreateError(json.error || "Failed to create team");
    }
    setCreating(false);
  }

  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  // Build tree: root teams first
  const rootTeams = filtered.filter((t) => !t.parentTeamId);
  const childMap = new Map<string, Team[]>();
  filtered.forEach((t) => {
    if (t.parentTeamId) {
      const children = childMap.get(t.parentTeamId) || [];
      children.push(t);
      childMap.set(t.parentTeamId, children);
    }
  });

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
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Teams</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {teams.length} team{teams.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Team
        </Button>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
        </div>
      </div>

      {teams.length === 0 ? (
        <Card className="text-center py-12">
          <FolderTree className="h-10 w-10 mx-auto text-[var(--color-text-tertiary)] mb-3" />
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            No teams yet. Create your first team to get started.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create Team
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {rootTeams.map((team) => (
            <TeamNode
              key={team.id}
              team={team}
              childMap={childMap}
              onNavigate={(id) => router.push(`/dashboard/teams/${id}`)}
              depth={0}
            />
          ))}
          {/* Show orphaned teams (parent filtered out) */}
          {filtered
            .filter((t) => t.parentTeamId && !filtered.find((p) => p.id === t.parentTeamId))
            .map((team) => (
              <TeamNode
                key={team.id}
                team={team}
                childMap={childMap}
                onNavigate={(id) => router.push(`/dashboard/teams/${id}`)}
                depth={0}
              />
            ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Team">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            id="team-name"
            label="Team Name"
            placeholder="e.g. Engineering"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[var(--color-text-primary)]">
              Description
            </label>
            <textarea
              placeholder="What does this team do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-10 w-10 rounded-lg border border-[var(--color-border)] cursor-pointer"
                />
                <span className="text-sm text-[var(--color-text-secondary)]">{form.color}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Parent Team
              </label>
              <select
                value={form.parentTeamId}
                onChange={(e) => setForm({ ...form, parentTeamId: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
              >
                <option value="">None (root team)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {createError && (
            <p className="text-sm text-[var(--color-danger)]">{createError}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Team
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function TeamNode({
  team,
  childMap,
  onNavigate,
  depth,
}: {
  team: Team;
  childMap: Map<string, Team[]>;
  onNavigate: (id: string) => void;
  depth: number;
}) {
  const children = childMap.get(team.id) || [];

  return (
    <div style={{ marginLeft: depth * 24 }}>
      <Card
        className="flex items-center gap-4 cursor-pointer hover:border-[var(--color-secondary)] hover:shadow-md transition-all"
        onClick={() => onNavigate(team.id)}
      >
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ backgroundColor: team.color || "#6366f1" }}
        >
          {team.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[var(--color-text-primary)] truncate">
              {team.name}
            </p>
            {team.parentTeamName && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                in {team.parentTeamName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
              <Users className="h-3 w-3" /> {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
            </span>
            {team.headName && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                Lead: {team.headName}
              </span>
            )}
          </div>
        </div>
        <div className="flex -space-x-2">
          {team.members.slice(0, 3).map((m) => (
            <Avatar
              key={m.id}
              src={m.avatar}
              firstName={m.firstName}
              lastName={m.lastName}
              size="sm"
              className="ring-2 ring-[var(--color-bg-primary)]"
            />
          ))}
          {team.memberCount > 3 && (
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-[var(--color-neutral-200)] text-xs font-medium text-[var(--color-text-secondary)] ring-2 ring-[var(--color-bg-primary)]">
              +{team.memberCount - 3}
            </div>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-[var(--color-text-tertiary)] shrink-0" />
      </Card>
      {children.map((child) => (
        <TeamNode
          key={child.id}
          team={child}
          childMap={childMap}
          onNavigate={onNavigate}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
