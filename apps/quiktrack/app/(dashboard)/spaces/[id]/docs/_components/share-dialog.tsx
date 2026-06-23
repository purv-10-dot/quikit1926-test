"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Loader2, Globe, Lock, X } from "lucide-react";
import { ShareSelect } from "./share-select";

type Role = "viewer" | "editor";

interface Person {
  shareId: string;
  userId: string | null;
  name: string;
  email: string;
  avatar: string | null;
  role: Role;
}
interface OwnerLite {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
}
interface SharesData {
  canManage: boolean;
  owner: OwnerLite | null;
  people: Person[];
  generalAccess: "restricted" | "anyone";
  generalRole: Role;
  shareToken: string | null;
}
interface OrgUser {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

/**
 * Per-user document sharing panel (Google-Docs-style). Self-contained: fetches
 * /api/docs/[id]/shares and manages people + general access. Only owners/admins
 * see the editing controls (`canManage`); everyone else sees a read-only list.
 */
export function ShareDialog({
  docId,
  onClose,
  onGeneralChange,
}: {
  docId: string;
  onClose: () => void;
  /** Notifies the editor when general (public-link) access changes. */
  onGeneralChange?: (shared: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<SharesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Add-people state.
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [query, setQuery] = useState("");
  const [pickedRole, setPickedRole] = useState<Role>("viewer");

  const load = useCallback(async () => {
    const j = await fetch(`/api/docs/${docId}/shares`).then((r) => r.json());
    if (j?.success) setData(j.data as SharesData);
    else setError(j?.error ?? "Couldn't load sharing.");
  }, [docId]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  // Org users for the add-people search (loaded once; filtered client-side).
  useEffect(() => {
    fetch(`/api/org/users`)
      .then((r) => r.json())
      .then((j) => j?.success && Array.isArray(j.data) && setOrgUsers(j.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function run(fn: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const j = await fn().then((r) => r.json());
      if (!j?.success) setError(j?.error ?? "Something went wrong.");
      await load();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const addPerson = (userId: string) =>
    run(() =>
      fetch(`/api/docs/${docId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: pickedRole }),
      }),
    );
  const changeRole = (shareId: string, role: Role) =>
    run(() =>
      fetch(`/api/docs/${docId}/shares/${shareId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      }),
    );
  const removePerson = (shareId: string) =>
    run(() => fetch(`/api/docs/${docId}/shares/${shareId}`, { method: "DELETE" }));

  async function setGeneral(generalAccess: "restricted" | "anyone", generalRole: Role) {
    await run(() =>
      fetch(`/api/docs/${docId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generalAccess, generalRole }),
      }),
    );
    onGeneralChange?.(generalAccess === "anyone");
  }

  // Copy the short, public /share/<token> URL (opens without login). If the doc
  // is still "Restricted" there's no public link yet, so generate one on demand
  // (flip to "Anyone with the link") rather than copying the in-app URL.
  async function copyLink() {
    let token = data?.shareToken ?? null;
    if (!token) {
      if (!canManage) {
        setError("Turn on “Anyone with the link” to copy a public link.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const j = await fetch(`/api/docs/${docId}/share`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generalAccess: "anyone", generalRole: data?.generalRole ?? "viewer" }),
        }).then((r) => r.json());
        if (j?.success && j.data?.token) {
          token = j.data.token as string;
          onGeneralChange?.(true);
          await load();
        } else {
          setError(j?.error ?? "Couldn't create a public link.");
          return;
        }
      } catch {
        setError("Couldn't create a public link.");
        return;
      } finally {
        setBusy(false);
      }
    }
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — copy it manually: " + url);
    }
  }

  const canManage = data?.canManage ?? false;
  const takenIds = new Set(
    [data?.owner?.userId, ...(data?.people.map((p) => p.userId) ?? [])].filter(Boolean) as string[],
  );
  const q = query.trim().toLowerCase();
  const matches = q
    ? orgUsers
        .filter((u) => !takenIds.has(u.userId))
        .filter((u) => {
          const name = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
          return name.includes(q) || u.email.toLowerCase().includes(q);
        })
        .slice(0, 6)
    : [];

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-96 rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <Link2 className="h-4 w-4 text-gray-500" />
        Share
      </h3>

      {loading ? (
        <div className="py-8 text-center text-xs text-gray-400">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        </div>
      ) : !data ? (
        <p className="mt-3 text-xs text-red-600">{error ?? "Couldn't load sharing."}</p>
      ) : (
        <>
          {/* A. Add people (managers only) */}
          {canManage && (
            <div className="relative mt-3">
              <div className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Add people in your org…"
                  className="h-9 flex-1 rounded-md border border-gray-300 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <ShareSelect
                  value={pickedRole}
                  onChange={(v) => setPickedRole(v as Role)}
                  align="right"
                  options={[
                    { value: "viewer", label: "Viewer" },
                    { value: "editor", label: "Editor" },
                  ]}
                  className="shrink-0"
                />
              </div>
              {matches.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {matches.map((u) => {
                    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
                    return (
                      <button
                        key={u.userId}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setQuery("");
                          void addPerson(u.userId);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white">
                          {(name[0] ?? "?").toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-gray-800">{name}</span>
                          <span className="block truncate text-[11px] text-gray-500">{u.email}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* B. People with access */}
          <p className="mt-4 text-xs font-semibold text-gray-700">People with access</p>
          <div className="mt-2 space-y-1.5">
            {data.owner && (
              <Row name={data.owner.name} email={data.owner.email} initial={data.owner.name}>
                <span className="text-xs text-gray-400">Owner</span>
              </Row>
            )}
            {data.people.map((p) => (
              <Row key={p.shareId} name={p.name} email={p.email} initial={p.name}>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <ShareSelect
                      value={p.role}
                      disabled={busy}
                      onChange={(v) => void changeRole(p.shareId, v as Role)}
                      align="right"
                      options={[
                        { value: "viewer", label: "Viewer" },
                        { value: "editor", label: "Editor" },
                      ]}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removePerson(p.shareId)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label="Remove access"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs capitalize text-gray-400">{p.role}</span>
                )}
              </Row>
            ))}
          </div>

          {/* C. General access */}
          <p className="mt-4 text-xs font-semibold text-gray-700">General access</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                data.generalAccess === "anyone" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {data.generalAccess === "anyone" ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <ShareSelect
                value={data.generalAccess}
                disabled={!canManage || busy}
                onChange={(v) =>
                  void setGeneral(v as "restricted" | "anyone", data.generalRole)
                }
                options={[
                  { value: "restricted", label: "Restricted" },
                  { value: "anyone", label: "Anyone with the link" },
                ]}
              />
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">
                {data.generalAccess === "anyone"
                  ? "Anyone on the internet with the link can open it."
                  : "Only people with access can open it."}
              </p>
            </div>
            {data.generalAccess === "anyone" && (
              <ShareSelect
                value={data.generalRole}
                disabled={!canManage || busy}
                onChange={(v) => void setGeneral("anyone", v as Role)}
                align="right"
                options={[
                  { value: "viewer", label: "Viewer" },
                  { value: "editor", label: "Editor" },
                ]}
                className="shrink-0"
              />
            )}
          </div>

          {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

          {/* D. Actions */}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={copyLink}
              disabled={busy || (!data.shareToken && !canManage)}
              title={
                data.shareToken
                  ? "Copy the public link"
                  : canManage
                    ? "Creates an 'Anyone with the link' link and copies it"
                    : "Ask the owner to enable link sharing"
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  name,
  email,
  initial,
  children,
}: {
  name: string;
  email: string;
  initial: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-400 text-xs font-semibold text-white">
        {(initial[0] ?? "?").toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-gray-800">{name}</span>
        <span className="block truncate text-[11px] text-gray-500">{email}</span>
      </span>
      {children}
    </div>
  );
}
