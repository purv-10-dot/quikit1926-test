"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button, FilterPicker, Input, SlidePanel } from "@quikit/ui";
import type { FilterOption } from "@quikit/ui";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
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

      <SlidePanel
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateError(""); }}
        title="Create Team"
        subtitle="Add a new team to the organization"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">Cancel</button>
            <button type="submit" form="create-team-form" disabled={creating} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">{creating ? "Creating..." : "Create Team"}</button>
          </div>
        }
      >
        <form id="create-team-form" onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Team Name</label>
            <input
              id="team-name"
              placeholder="e.g. Engineering"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Description</label>
            <textarea
              placeholder="What does this team do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-10 w-10 rounded-lg border border-gray-200 cursor-pointer"
                />
                <span className="text-sm text-gray-500">{form.color}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Parent Team</label>
              <FilterPicker
                value={form.parentTeamId || ""}
                onChange={(val) => setForm({ ...form, parentTeamId: val || "" })}
                options={teams.map((t): FilterOption => ({ value: t.id, label: t.name }))}
                allLabel="None (root team)"
                placeholder="Select parent team"
              />
            </div>
          </div>
          {createError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>}
        </form>
      </SlidePanel>
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
