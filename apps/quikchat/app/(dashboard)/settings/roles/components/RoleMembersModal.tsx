"use client";

/**
 * Role-centric membership editor (RBAC Phase 3, C2). Opens from the matrix
 * header. Loads the role's current members, lets an admin search org users and
 * toggle them, then PUTs the full desired set to `/api/org/roles/[id]/members`
 * (server reconciles: attaches new, detaches removed, skips users without a
 * QuikChat UserAppAccess row, and guards the last-admin invariant).
 *
 * Divergence from QuikScale (per plan C2): QuikChat has no Users tab, so
 * membership is edited role-first here rather than via a per-user dropdown.
 * The picker uses `/api/users` (bare `PublicUser[]` — id/displayName/avatar;
 * no email, so we show displayName only).
 */

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

interface Member {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}
interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

function nameOf(m: Member): string {
  const full = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return full || m.email || m.id;
}

export function RoleMembersModal({
  roleId,
  roleName,
  onClose,
}: {
  roleId: string;
  roleName: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Map<string, string>>(new Map()); // userId → label
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);

  // Load current members.
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/org/roles/${roleId}/members`);
        const json = await res.json();
        if (!mounted) return;
        if (json.success) {
          const map = new Map<string, string>();
          for (const m of json.data.members as Member[]) map.set(m.id, nameOf(m));
          setSelected(map);
        } else {
          setError("Failed to load members");
        }
      } catch {
        if (mounted) setError("Network error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [roleId]);

  // Search users (debounced-ish: fire on query change).
  useEffect(() => {
    let mounted = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users?q=${encodeURIComponent(q)}`);
        const users = (await res.json()) as PublicUser[];
        if (mounted) setResults(Array.isArray(users) ? users : []);
      } catch {
        if (mounted) setResults([]);
      }
    }, 200);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [q]);

  function toggle(u: PublicUser) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(u.id)) next.delete(u.id);
      else next.set(u.id, u.displayName);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/org/roles/${roleId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected.keys()) }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to save members");
        return;
      }
      onClose();
    } catch {
      setError("Network error saving");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[440px] max-w-full max-h-[80vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Members — {roleName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="w-full text-xs border border-gray-300 rounded-md pl-8 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--qc-accent)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 px-3 py-3 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400">No users found.</p>
          ) : (
            results.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggle(u)}
                  className="h-4 w-4 rounded border-gray-300 accent-[var(--qc-accent)]"
                />
                <span className="text-sm text-gray-800">{u.displayName}</span>
              </label>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
          <span className="text-[11px] text-gray-500">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            {error && <span className="text-[11px] text-red-600">{error}</span>}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold text-[var(--qc-accent-fg)] bg-[var(--qc-accent)] hover:bg-[var(--qc-accent-strong)] rounded-lg disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
