"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, AppWindow, Check, X } from "lucide-react";

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface UserAppRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  status: string;
  apps: {
    appId: string;
    appName: string;
    hasAccess: boolean;
    role: string | null;
  }[];
}

export default function AppsPage() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [matrix, setMatrix] = useState<UserAppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  async function fetchAccess() {
    const res = await fetch("/api/apps/access");
    const json = await res.json();
    if (json.success) {
      setApps(json.data.apps);
      setMatrix(json.data.matrix);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchAccess();
  }, []);

  async function toggleAccess(userId: string, appId: string, currentlyHasAccess: boolean) {
    const key = `${userId}:${appId}`;
    setToggling(key);

    if (currentlyHasAccess) {
      await fetch("/api/apps/access", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, appId }),
      });
    } else {
      await fetch("/api/apps/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, appId }),
      });
    }

    // Optimistic update
    setMatrix((prev) =>
      prev.map((row) => {
        if (row.userId !== userId) return row;
        return {
          ...row,
          apps: row.apps.map((a) =>
            a.appId === appId
              ? { ...a, hasAccess: !currentlyHasAccess, role: !currentlyHasAccess ? "member" : null }
              : a
          ),
        };
      })
    );
    setToggling(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Apps</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Manage app access for members
          </p>
        </div>
        <Card className="text-center py-12">
          <AppWindow className="h-10 w-10 mx-auto text-[var(--color-text-tertiary)] mb-3" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            No apps registered yet. Apps will appear here once they&apos;re added to the platform.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Apps</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Toggle app access for each member. {apps.length} app{apps.length !== 1 ? "s" : ""} registered.
        </p>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3 sticky left-0 bg-[var(--color-bg-secondary)]">
                Member
              </th>
              {apps.map((app) => (
                <th
                  key={app.id}
                  className="text-center text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3 min-w-[120px]"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{app.name}</span>
                    <Badge variant={app.status === "active" ? "active" : "inactive"}>
                      {app.status}
                    </Badge>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr
                key={row.userId}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                <td className="px-4 py-3 sticky left-0 bg-[var(--color-bg-primary)]">
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={row.avatar}
                      firstName={row.firstName}
                      lastName={row.lastName}
                      size="sm"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {row.firstName} {row.lastName}
                        </p>
                        {row.status === "invited" && (
                          <Badge variant="invited">invited</Badge>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{row.email}</p>
                    </div>
                  </div>
                </td>
                {row.apps.map((appAccess) => {
                  const key = `${row.userId}:${appAccess.appId}`;
                  const isToggling = toggling === key;

                  return (
                    <td key={appAccess.appId} className="px-4 py-3 text-center">
                      <button
                        onClick={() =>
                          toggleAccess(row.userId, appAccess.appId, appAccess.hasAccess)
                        }
                        disabled={isToggling}
                        className={`inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                          appAccess.hasAccess
                            ? "bg-[var(--color-success-light)] text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-white"
                            : "bg-[var(--color-neutral-100)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-neutral-200)]"
                        }`}
                      >
                        {isToggling ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : appAccess.hasAccess ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {matrix.length === 0 && (
              <tr>
                <td colSpan={apps.length + 1} className="px-4 py-8 text-center text-sm text-[var(--color-text-tertiary)]">
                  No active members found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
