"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, ChevronDown, Check, User, Building2, Globe, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Visibility = "private" | "org" | "space" | "user";

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "private", label: "Private", hint: "Only you", icon: User },
  { value: "org", label: "My organization", hint: "Everyone", icon: Globe },
  { value: "space", label: "Space", hint: "Members of chosen projects", icon: Building2 },
  { value: "user", label: "User", hint: "Specific people", icon: Users },
];

interface Picked {
  id: string;
  label: string;
}
interface ProjectLite {
  id: string;
  name: string;
}
interface UserLite {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

/** Custom Viewers dropdown — iconed options, matching the Jira picker look. */
function VisibilityDropdown({
  value,
  onChange,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = VISIBILITY_OPTIONS.find((o) => o.value === value) ?? VISIBILITY_OPTIONS[0]!;
  const CurrentIcon = current.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full h-9 px-3 text-sm border border-gray-300 rounded bg-white text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <CurrentIcon className="h-4 w-4 text-gray-500 shrink-0" />
        <span className="flex-1 text-left truncate">{current.label}</span>
        <span className="text-xs text-gray-400 shrink-0">{current.hint}</span>
        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl py-1">
          {VISIBILITY_OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-blue-50 ${
                  active ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-gray-500"}`} />
                <span className="flex-1 truncate">
                  {o.label} <span className="text-gray-400">— {o.hint.toLowerCase()}</span>
                </span>
                {active && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * "Save filter" modal — name/description + visibility. Visibility mirrors Jira's
 * Viewers: Private (only you), My organization (everyone), Space (members of the
 * chosen projects), User (the chosen people). Space/User keep a list of targets
 * in `viewerIds`.
 */
export function SaveFilterModal({
  onClose,
  onSaved,
  criteria,
}: {
  onClose: () => void;
  onSaved: (saved: { id: string; name: string }) => void;
  criteria: unknown;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Target lists reset when switching scope (space ids vs user ids differ).
  useEffect(() => {
    setPicked([]);
  }, [visibility]);

  const targetsOk =
    (visibility !== "space" && visibility !== "user") || picked.length > 0;
  const canSave = name.trim().length > 0 && targetsOk && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          visibility,
          viewerIds:
            visibility === "space" || visibility === "user" ? picked.map((p) => p.id) : [],
          criteria,
        }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error ?? "Couldn't save filter");
      onSaved({ id: json.data.id, name: json.data.name });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't save filter");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Save filter</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            Required fields are marked with an asterisk <span className="text-red-500">*</span>
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Viewers</label>
            <VisibilityDropdown value={visibility} onChange={setVisibility} />

            {visibility === "space" && (
              <SpacePicker picked={picked} onChange={setPicked} />
            )}
            {visibility === "user" && (
              <UserPicker picked={picked} onChange={setPicked} />
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="px-4 h-9 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Chips + a searchable list, shared by the Space/User pickers. */
function PickedChips({ picked, onRemove }: { picked: Picked[]; onRemove: (id: string) => void }) {
  if (picked.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {picked.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 text-xs px-2 py-1">
          {p.label}
          <button type="button" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.label}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function SpacePicker({ picked, onChange }: { picked: Picked[]; onChange: (next: Picked[]) => void }) {
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/projects?pageSize=100&sort=name&order=asc")
      .then((r) => r.json())
      .then((j) => alive && j?.success && setProjects((j.data ?? []).map((p: ProjectLite) => ({ id: p.id, name: p.name }))))
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return projects
      .filter((p) => !pickedIds.has(p.id))
      .filter((p) => (query ? p.name.toLowerCase().includes(query) : true))
      .slice(0, 50);
  }, [projects, q, pickedIds]);

  return (
    <div className="mt-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects…"
          className="w-full pl-7 pr-2 h-8 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      {q && shown.length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange([...picked, { id: p.id, label: p.name }]); setQ(""); }}
              className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 truncate"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <PickedChips picked={picked} onRemove={(id) => onChange(picked.filter((p) => p.id !== id))} />
    </div>
  );
}

function UserPicker({ picked, onChange }: { picked: Picked[]; onChange: (next: Picked[]) => void }) {
  const [results, setResults] = useState<UserLite[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}&limit=20`)
        .then((r) => r.json())
        .then((j) => alive && j?.success && setResults(j.data ?? []))
        .catch(() => undefined);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);
  const nameOf = (u: UserLite) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
  const shown = results.filter((u) => !pickedIds.has(u.userId)).slice(0, 20);

  return (
    <div className="mt-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="w-full pl-7 pr-2 h-8 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      {q && shown.length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded">
          {shown.map((u) => (
            <button
              key={u.userId}
              type="button"
              onClick={() => { onChange([...picked, { id: u.userId, label: nameOf(u) }]); setQ(""); }}
              className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 truncate"
            >
              {nameOf(u)}
            </button>
          ))}
        </div>
      )}
      <PickedChips picked={picked} onRemove={(id) => onChange(picked.filter((p) => p.id !== id))} />
    </div>
  );
}
