"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Building2, Users, UserCheck, AppWindow, Loader2 } from "lucide-react";

interface DashboardStats {
  orgCount: number;
  userCount: number;
  activeMembershipCount: number;
  appCount: number;
}

const statCards = [
  { key: "orgCount" as const, label: "Organisations", icon: Building2, color: "#6366f1" },
  { key: "userCount" as const, label: "Users", icon: Users, color: "#10b981" },
  { key: "activeMembershipCount" as const, label: "Active Memberships", icon: UserCheck, color: "#f59e0b" },
  { key: "appCount" as const, label: "Registered Apps", icon: AppWindow, color: "#8b5cf6" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const res = await fetch("/api/dashboard/stats");
      const json = await res.json();
      if (json.success) {
        setStats(json.data);
      }
      setLoading(false);
    }
    fetchStats();
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
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Platform Overview</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Super admin dashboard for the entire QuikIT platform
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.key} className="flex items-center gap-4 p-5">
            <div
              className="flex items-center justify-center h-12 w-12 rounded-xl shrink-0"
              style={{ backgroundColor: `${card.color}15` }}
            >
              <card.icon className="h-6 w-6" style={{ color: card.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                {stats?.[card.key] ?? 0}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">{card.label}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
