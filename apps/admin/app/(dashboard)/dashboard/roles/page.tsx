"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Users,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface RoleInfo {
  id: string;
  label: string;
  description: string;
  level: number;
  permissions: string[];
  memberCount: number;
}

const PERMISSION_CATEGORIES: Record<string, { label: string; permissions: string[] }> = {
  org: {
    label: "Organisation",
    permissions: ["org.manage", "org.delete", "org.billing"],
  },
  members: {
    label: "Members",
    permissions: ["members.invite", "members.manage", "members.remove"],
  },
  teams: {
    label: "Teams",
    permissions: ["teams.create", "teams.manage", "teams.delete"],
  },
  apps: {
    label: "Apps & Roles",
    permissions: ["apps.manage", "roles.manage"],
  },
  kpi: {
    label: "KPIs",
    permissions: ["kpi.view_all", "kpi.view_team", "kpi.view_own", "kpi.manage", "kpi.update_own"],
  },
  priority: {
    label: "Priorities",
    permissions: [
      "priority.view_all", "priority.view_team", "priority.view_own",
      "priority.manage", "priority.update_own",
    ],
  },
  meetings: {
    label: "Meetings",
    permissions: ["meetings.manage", "meetings.view"],
  },
  reports: {
    label: "Reports",
    permissions: ["reports.view_all", "reports.view_team"],
  },
};

const PERMISSION_LABELS: Record<string, string> = {
  "org.manage": "Manage settings",
  "org.delete": "Delete organisation",
  "org.billing": "Manage billing",
  "members.invite": "Invite members",
  "members.manage": "Edit members",
  "members.remove": "Remove members",
  "teams.create": "Create teams",
  "teams.manage": "Manage teams",
  "teams.delete": "Delete teams",
  "apps.manage": "Manage app access",
  "roles.manage": "Manage roles",
  "kpi.view_all": "View all KPIs",
  "kpi.view_team": "View team KPIs",
  "kpi.view_own": "View own KPIs",
  "kpi.manage": "Manage KPIs",
  "kpi.update_own": "Update own KPIs",
  "priority.view_all": "View all priorities",
  "priority.view_team": "View team priorities",
  "priority.view_own": "View own priorities",
  "priority.manage": "Manage priorities",
  "priority.update_own": "Update own priorities",
  "meetings.manage": "Manage meetings",
  "meetings.view": "View meetings",
  "reports.view_all": "View all reports",
  "reports.view_team": "View team reports",
};

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRoles() {
      const res = await fetch("/api/roles");
      const json = await res.json();
      if (json.success) setRoles(json.data);
      setLoading(false);
    }
    fetchRoles();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Roles & Permissions</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          View role hierarchy and default permissions for each role
        </p>
      </div>

      {/* Role hierarchy visual */}
      <Card className="mb-6">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
          Role Hierarchy
        </h3>
        <div className="flex items-end gap-2">
          {roles.map((role, i) => (
            <div key={role.id} className="flex-1 text-center">
              <div
                className="rounded-lg mx-auto mb-2 flex items-center justify-center"
                style={{
                  height: `${20 + role.level * 16}px`,
                  backgroundColor: `hsl(${240 - i * 30}, 70%, ${85 - role.level * 5}%)`,
                }}
              >
                <span className="text-xs font-medium" style={{ color: `hsl(${240 - i * 30}, 70%, 30%)` }}>
                  {role.level}
                </span>
              </div>
              <p className="text-xs font-medium text-[var(--color-text-primary)]">{role.label}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {role.memberCount} member{role.memberCount !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Role details */}
      <div className="space-y-3">
        {roles.map((role) => {
          const isExpanded = expanded === role.id;
          const permSet = new Set(role.permissions);

          return (
            <Card key={role.id} className="p-0 overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : role.id)}
                className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-secondary-light)]">
                  <ShieldCheck className="h-5 w-5 text-[var(--color-secondary)]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[var(--color-text-primary)]">{role.label}</p>
                    <Badge variant={role.id}>{role.id}</Badge>
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                    {role.description}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-sm text-[var(--color-text-tertiary)]">
                    <Users className="h-4 w-4" /> {role.memberCount}
                  </span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {role.permissions.length} permissions
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-6 pb-4 border-t border-[var(--color-border)]">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                    {Object.entries(PERMISSION_CATEGORIES).map(([key, category]) => {
                      const categoryPerms = category.permissions;
                      const hasAny = categoryPerms.some((p) => permSet.has(p));
                      if (!hasAny) return null;

                      return (
                        <div key={key}>
                          <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-2">
                            {category.label}
                          </p>
                          <div className="space-y-1">
                            {categoryPerms.map((perm) => (
                              <div key={perm} className="flex items-center gap-2">
                                <div
                                  className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center ${
                                    permSet.has(perm)
                                      ? "bg-[var(--color-success)] border-[var(--color-success)]"
                                      : "border-[var(--color-border)]"
                                  }`}
                                >
                                  {permSet.has(perm) && (
                                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                                <span
                                  className={`text-xs ${
                                    permSet.has(perm)
                                      ? "text-[var(--color-text-primary)]"
                                      : "text-[var(--color-text-tertiary)] line-through"
                                  }`}
                                >
                                  {PERMISSION_LABELS[perm] || perm}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
