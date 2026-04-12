"use client";

/**
 * Super Admin: Platform Users — /users-admin
 *
 * View all users across all tenants. Search, filter by tenant,
 * view activity. Platform-wide user management.
 */

import { useState, useEffect } from "react";
import { Users, Search } from "lucide-react";

interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  lastSignInAt: string | null;
  membershipCount: number;
}

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/super/users")
      .then((r) => r.json())
      .then((j) => { if (j.success) setUsers(j.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Platform Users</h1>
          <p className="text-sm text-gray-500">
            {users.length} users across all organizations
          </p>
        </div>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-xl w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No users found.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">User</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Orgs</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Last Sign In</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{u.membershipCount}</td>
                  <td className="px-4 py-3">
                    {u.isSuperAdmin ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
                        Super Admin
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">User</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.lastSignInAt
                      ? new Date(u.lastSignInAt).toLocaleString()
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
