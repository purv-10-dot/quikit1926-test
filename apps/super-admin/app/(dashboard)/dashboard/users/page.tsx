"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Users,
  Search,
  ChevronRight,
  Loader2,
  ShieldCheck,
} from "lucide-react";

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  isSuperAdmin: boolean;
  orgCount: number;
  lastSignInAt: string | null;
  createdAt: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function fetchUsers() {
    const url = search
      ? `/api/users?search=${encodeURIComponent(search)}`
      : "/api/users";
    const res = await fetch(url);
    const json = await res.json();
    if (json.success) setUsers(json.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers();
  }, [search]);

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
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Users</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {users.length} user{users.length !== 1 ? "s" : ""} across the platform
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                User
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Role
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Organisations
              </th>
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">
                Last Sign In
              </th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
                onClick={() => router.push(`/dashboard/users/${user.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={user.avatar} firstName={user.firstName} lastName={user.lastName} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {user.isSuperAdmin ? (
                    <Badge variant="super_admin">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Super Admin
                    </Badge>
                  ) : (
                    <span className="text-sm text-[var(--color-text-secondary)]">User</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {user.orgCount}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-[var(--color-text-tertiary)]">
                    {formatDate(user.lastSignInAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ChevronRight className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <Users className="h-10 w-10 mx-auto text-[var(--color-text-tertiary)] mb-3" />
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    No users found
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
