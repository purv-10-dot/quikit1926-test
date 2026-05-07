"use client";

/**
 * Roles → Users list page (the landing screen for "User Permission").
 *
 * Layout (matches reference screenshot 2):
 *   ┌── Search ─────┬── Filter by Org ─┐               [+ Add User] [Manage Roles]
 *   │ All Users  GOAL                                                          │
 *   ├──────────────────────────────────────────────────────────────────────────┤
 *   │ Users        │ Email                  │ Account Type │ Roles ▾  │ Status │
 *   │ Alice Smith  │ alice@…                │ Org Account  │ admin ▾  │ ACTIVE │
 *   │ Bob Lee      │ bob@…                  │ User Account │ User  ▾  │ ACTIVE │
 *   └──────────────────────────────────────────────────────────────────────────┘
 *
 * The Roles dropdown changes the user's AppRole inline (PATCH /api/org/users/[id]/role).
 * The Status switch suspends/restores the user's membership (PATCH /api/org/users/[id]/status).
 * Manage Roles → /org-setup/roles/manage (the matrix UI).
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Shield, Check, X, AlertCircle, ChevronDown } from "lucide-react";
import { Pagination } from "@quikit/ui";

interface OrgUser {
  membershipId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  role: string;            // legacy Membership.role
  status: string;          // active | inactive | invited
  appRoleId: string | null;
  appRoleName: string | null;
  joinedAt: string;
}

interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  isDefault: boolean;
}

type Tab = "all" | "app";

export default function UsersListPage() {
  const router = useRouter();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("app");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Pagination — defaults to the global standard (10 rows per page).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    void Promise.all([loadUsers(), loadRoles()]).finally(() => setLoading(false));
  }, []);

  async function loadUsers() {
    const res = await fetch("/api/org/users?pageSize=200");
    const json = await res.json();
    if (json.success) setUsers((json.data?.items ?? json.data ?? []) as OrgUser[]);
  }

  async function loadRoles() {
    const res = await fetch("/api/org/roles");
    const json = await res.json();
    if (json.success) setRoles(json.data as Role[]);
  }

  // ── Inline role change ───────────────────────────────────────────────────
  async function handleRoleChange(user: OrgUser, roleId: string | null) {
    if ((user.appRoleId ?? null) === roleId) return; // no-op
    setSavingUserId(user.userId);
    const previous = user.appRoleId;
    const previousName = user.appRoleName;

    // Optimistic update — revert on error.
    const newRoleName = roles.find((r) => r.id === roleId)?.name ?? null;
    setUsers((u) =>
      u.map((row) =>
        row.userId === user.userId
          ? { ...row, appRoleId: roleId, appRoleName: newRoleName }
          : row,
      ),
    );

    try {
      const res = await fetch(`/api/org/users/${user.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const json = await res.json();
      if (!json.success) {
        // Revert
        setUsers((u) =>
          u.map((row) =>
            row.userId === user.userId
              ? { ...row, appRoleId: previous, appRoleName: previousName }
              : row,
          ),
        );
        flashToast(false, json.error ?? "Role update failed");
      } else {
        flashToast(true, `Role updated to ${newRoleName ?? "—"}`);
      }
    } finally {
      setSavingUserId(null);
    }
  }

  // ── Inline status toggle ─────────────────────────────────────────────────
  async function handleStatusToggle(user: OrgUser) {
    const next = user.status === "active" ? "inactive" : "active";
    setSavingUserId(user.userId);
    setUsers((u) => u.map((row) => (row.userId === user.userId ? { ...row, status: next } : row)));

    try {
      const res = await fetch(`/api/org/users/${user.userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!json.success) {
        setUsers((u) =>
          u.map((row) => (row.userId === user.userId ? { ...row, status: user.status } : row)),
        );
        flashToast(false, json.error ?? "Status update failed");
      } else {
        flashToast(true, `User ${next === "active" ? "activated" : "deactivated"}`);
      }
    } finally {
      setSavingUserId(null);
    }
  }

  function flashToast(ok: boolean, message: string) {
    setToast({ ok, message });
    setTimeout(() => setToast(null), 2200);
  }

  // ── Derived display list ─────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;
    if (tab === "app") {
      // GOAL tab → only users who have a QuikScale dynamic role assigned
      // OR have an active legacy app-access membership. With our current
      // schema that's anyone with a Membership row in this tenant — i.e.
      // everyone returned by /api/org/users. So the tab effectively does
      // not filter today. Once cross-tenant users land, this gets more
      // selective.
      list = users;
    }
    if (q) {
      list = list.filter(
        (u) =>
          u.firstName.toLowerCase().includes(q) ||
          u.lastName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, search, tab]);

  // Reset to page 1 whenever the filtered list shape changes — otherwise the
  // user can be stranded on an empty page (e.g. typing a search that drops
  // total < (page-1)*pageSize).
  useEffect(() => {
    setPage(1);
  }, [search, tab, pageSize]);

  const total = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visibleUsers = useMemo(
    () => filteredUsers.slice((page - 1) * pageSize, page * pageSize),
    [filteredUsers, page, pageSize],
  );

  return (
    // h-full → fill the dashboard <main>'s visible area (which is itself
    // overflow-y-auto). Combined with `flex flex-col` + `min-h-0` on the
    // card below, this keeps page-level scrolling off and routes overflow
    // into the table area only — so the pagination footer stays pinned.
    <div className="p-6 h-full flex flex-col">
      {/* Top toolbar — search + filter (left), Add User + Manage Roles (right). */}
      <header className="flex items-center gap-3 mb-3 flex-shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
        <div className="flex-1 max-w-xs">
          <select
            disabled
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-md text-gray-400 bg-white cursor-not-allowed"
            title="Cross-organisation filter — coming soon"
          >
            <option>Filter by Organization</option>
          </select>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-accent-600 hover:bg-accent-700 text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add User
        </button>
        <button
          type="button"
          onClick={() => router.push("/org-setup/roles/manage")}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <Shield className="h-3.5 w-3.5" /> Manage Roles
        </button>
      </header>

      {/* Tabs */}
      <nav className="flex items-center gap-1 border-b border-gray-200 mb-3 flex-shrink-0">
        {([
          { key: "all", label: "All Users" },
          { key: "app", label: "GOAL" },
        ] as Array<{ key: Tab; label: string }>).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px ${
              tab === t.key
                ? "text-accent-700 border-accent-500"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Users card — fills remaining vertical space.
          Inside: table-area scrolls, pagination footer is pinned at the bottom. */}
      <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-accent-50 sticky top-0 z-10">
            <tr className="text-gray-600 font-semibold">
              <th className="text-left px-4 py-2.5">Users</th>
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="text-left px-4 py-2.5 w-[160px]">Account Type</th>
              <th className="text-left px-4 py-2.5 w-[200px]">Roles</th>
              <th className="text-left px-4 py-2.5 w-[160px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-xs text-gray-400">Loading…</td></tr>
            ) : visibleUsers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-xs text-gray-400">No users match your search.</td></tr>
            ) : (
              visibleUsers.map((u) => {
                const initials = `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase();
                const isActive = u.status === "active";
                const isOrgAccount = u.role === "admin"; // heuristic — admins are the org-account users
                return (
                  <tr key={u.userId} className="border-t border-gray-100 hover:bg-gray-50/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-7 w-7 rounded-full bg-accent-100 text-accent-700 text-[10px] font-semibold flex items-center justify-center">
                          {initials || "?"}
                        </span>
                        <span className="text-sm text-gray-900">{u.firstName} {u.lastName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{u.email}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {isOrgAccount ? "Org Account" : "User Account"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="relative">
                        <select
                          value={u.appRoleId ?? ""}
                          disabled={savingUserId === u.userId}
                          onChange={(e) =>
                            handleRoleChange(u, e.target.value ? e.target.value : null)
                          }
                          className="w-full appearance-none px-3 py-1.5 pr-7 text-xs border border-gray-200 rounded-md bg-white text-gray-800 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:opacity-50"
                        >
                          <option value="">— No role —</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {isActive ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          {isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(u)}
                          disabled={savingUserId === u.userId}
                          aria-label={isActive ? "Deactivate user" : "Activate user"}
                          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                            isActive ? "bg-accent-600" : "bg-gray-300"
                          } disabled:opacity-50`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                              isActive ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {/* Global pagination footer — pinned at the bottom of the card.
            Sits OUTSIDE the scrolling wrapper so it's always visible
            regardless of how many rows the user picked (10/20/30/…). */}
        {!loading && total > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[400] px-4 py-2.5 rounded-md shadow-lg text-xs font-medium flex items-center gap-2 ${
            toast.ok
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {toast.message}
        </div>
      )}

      {/* Add User modal */}
      {addOpen && (
        <AddUserModal
          roles={roles}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            void loadUsers();
            flashToast(true, "User added");
          }}
        />
      )}
    </div>
  );
}

// ── Add User modal ────────────────────────────────────────────────────────

interface NewUserRow {
  email: string;
  name: string;
  app: string;
  roleId: string;
}

function emptyRow(): NewUserRow {
  return { email: "", name: "", app: "GOAL", roleId: "" };
}

function AddUserModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: Role[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [rows, setRows] = useState<NewUserRow[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(i: number, field: keyof NewUserRow, value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  async function submit() {
    // Validate every row.
    for (const r of rows) {
      if (!r.email.trim() || !r.name.trim()) {
        setError("Every row needs an email and a name.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      // Sequentially POST each user — the server enforces the duplicate guard,
      // and a partial-failure scenario should not silently roll back valid creates.
      let lastError: string | null = null;
      for (const r of rows) {
        const [first, ...rest] = r.name.trim().split(/\s+/);
        const res = await fetch("/api/org/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: first,
            lastName: rest.join(" ") || first,
            email: r.email.trim(),
            // `password` is required by the existing schema. Until we replace
            // the create flow with an invitation-based one (Batch follow-up),
            // generate a short random temp password the admin can rotate.
            password: Math.random().toString(36).slice(2, 10) + "Aa1!",
            role: "member",
          }),
        });
        const json = await res.json();
        if (!json.success) {
          lastError = json.error ?? "Failed to add user";
          continue;
        }
        // If a role was picked, assign it.
        if (r.roleId && json.data?.userId) {
          await fetch(`/api/org/users/${json.data.userId}/role`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roleId: r.roleId }),
          });
        }
      }
      if (lastError) {
        setError(lastError);
        return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Add New Users</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Add users by entering their email and assigning access
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1.4fr_1fr_0.8fr_1fr_auto] gap-3 items-end p-3 border border-gray-200 rounded-lg bg-gray-50/40"
            >
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={r.email}
                  onChange={(e) => setField(i, "email", e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  value={r.name}
                  onChange={(e) => setField(i, "name", e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">App</label>
                <select
                  value={r.app}
                  onChange={(e) => setField(i, "app", e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white"
                >
                  <option value="GOAL">GOAL</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={r.roleId}
                  onChange={(e) => setField(i, "roleId", e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white"
                >
                  <option value="">— No role —</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
                className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed pb-1.5"
                title="Remove this user"
                aria-label="Remove this user"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:text-accent-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add another user
          </button>

          {error && (
            <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="text-xs px-4 py-1.5 rounded-md bg-accent-600 hover:bg-accent-700 text-white font-medium disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add User"}
          </button>
        </footer>
      </div>
    </div>
  );
}
