"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Building2,
} from "lucide-react";

interface UserDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  isSuperAdmin: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  memberships: {
    id: string;
    orgId: string;
    orgName: string;
    orgSlug: string;
    role: string;
    status: string;
  }[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  async function fetchUser() {
    const res = await fetch(`/api/users/${params.id}`);
    const json = await res.json();
    if (json.success) {
      setUser(json.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchUser();
  }, [params.id]);

  async function handleToggleSuperAdmin() {
    if (!user) return;
    const action = user.isSuperAdmin ? "remove super admin privileges from" : "grant super admin privileges to";
    if (!confirm(`Are you sure you want to ${action} ${user.firstName} ${user.lastName}?`)) return;

    setToggling(true);
    const res = await fetch(`/api/users/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSuperAdmin: !user.isSuperAdmin }),
    });
    const json = await res.json();
    if (json.success) {
      setUser((prev) => prev ? { ...prev, isSuperAdmin: json.data.isSuperAdmin } : prev);
    }
    setToggling(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  if (!user) {
    return <p className="text-[var(--color-text-secondary)]">User not found</p>;
  }

  return (
    <div>
      <button
        onClick={() => router.push("/dashboard/users")}
        className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile card */}
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center text-center mb-4">
            <Avatar src={user.avatar} firstName={user.firstName} lastName={user.lastName} size="lg" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mt-3">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-sm text-[var(--color-text-tertiary)]">{user.email}</p>
            {user.isSuperAdmin && (
              <Badge variant="super_admin" className="mt-2">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Super Admin
              </Badge>
            )}
          </div>

          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Last Sign In</span>
              <span className="text-[var(--color-text-primary)]">{formatDate(user.lastSignInAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Created</span>
              <span className="text-[var(--color-text-primary)]">{formatDate(user.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Organisations</span>
              <span className="text-[var(--color-text-primary)]">{user.memberships.length}</span>
            </div>
          </div>

          <Button
            size="sm"
            variant={user.isSuperAdmin ? "danger" : "primary"}
            className="w-full"
            onClick={handleToggleSuperAdmin}
            loading={toggling}
          >
            {user.isSuperAdmin ? (
              <>
                <ShieldOff className="h-3.5 w-3.5" /> Remove Super Admin
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5" /> Grant Super Admin
              </>
            )}
          </Button>
        </Card>

        {/* Memberships */}
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
            Organisation Memberships ({user.memberships.length})
          </h3>
          {user.memberships.length > 0 ? (
            <div className="space-y-2">
              {user.memberships.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-4 py-3 hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/organisations/${m.orgId}`)}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {m.orgName}
                      </p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{m.orgSlug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.role}>{m.role}</Badge>
                    <Badge variant={m.status}>{m.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-tertiary)] text-center py-6">
              This user has no organisation memberships.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
