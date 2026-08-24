"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/lib/shared";
import { Avatar, SearchInput, Spinner, X } from "@/components/ui";
import { fetchOrgUsers } from "@/lib/api";

export interface UserPickerProps {
  multi?: boolean;
  excludeChannelId?: string;
  /** Exclude the current user (default true). */
  excludeSelf?: boolean;
  onChange: (users: PublicUser[]) => void;
  placeholder?: string;
}

/** Debounced, org-scoped user search with single/multi select + chips. */
export function UserPicker({
  multi = false,
  excludeChannelId,
  excludeSelf = true,
  onChange,
  placeholder,
}: UserPickerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PublicUser[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const reqId = useRef(0);
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    fetchOrgUsers({ q: debounced || undefined, excludeChannelId, excludeSelf })
      .then((users) => {
        if (id === reqId.current) setResults(users);
      })
      .catch(() => {
        if (id === reqId.current) setResults([]);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [debounced, excludeChannelId, excludeSelf]);

  function commit(next: PublicUser[]) {
    setSelected(next);
    onChange(next);
  }

  function pick(user: PublicUser) {
    if (multi) {
      if (selected.some((u) => u.id === user.id)) return;
      commit([...selected, user]);
    } else {
      commit([user]);
    }
  }

  function remove(id: string) {
    commit(selected.filter((u) => u.id !== id));
  }

  const selectedIds = new Set(selected.map((u) => u.id));
  const visible = results.filter((u) => !selectedIds.has(u.id));

  return (
    <div className="qc-userpicker" data-testid="user-picker">
      {selected.length > 0 ? (
        <div className="qc-chips">
          {selected.map((u) => (
            <span key={u.id} className="qc-chip">
              <Avatar name={u.displayName} id={u.id} avatarUrl={u.avatarUrl} size={18} />
              {u.displayName}
              {u.isGuest ? <span className="qc-badge-external">External</span> : null}
              <button
                type="button"
                aria-label={`Remove ${u.displayName}`}
                onClick={() => remove(u.id)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <SearchInput
        placeholder={placeholder ?? "Search people"}
        aria-label="Search people"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="qc-user-results" role="listbox" aria-label="People">
        {loading && results.length === 0 ? (
          <div style={{ padding: 12 }}>
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <div className="qc-detail-row">
            <span>No people found</span>
          </div>
        ) : (
          visible.map((u) => (
            <button
              key={u.id}
              type="button"
              className="qc-pick-row"
              role="option"
              aria-selected={false}
              onClick={() => pick(u)}
            >
              <Avatar name={u.displayName} id={u.id} avatarUrl={u.avatarUrl} size={28} />
              <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                {u.displayName}
                {u.isGuest ? <span className="qc-badge-external">External</span> : null}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
