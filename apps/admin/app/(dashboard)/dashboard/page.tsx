"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Users, FolderTree, Mail, AppWindow } from "lucide-react";
import { Loader2 } from "lucide-react";

interface DashboardStats {
  memberCount: number;
  teamCount: number;
  pendingInvites: number;
  appCount: number;
}

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
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Overview</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Organisation management at a glance
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Members"
          value={stats?.memberCount ?? 0}
          icon={Users}
          color="#6366f1"
        />
        <StatCard
          label="Teams"
          value={stats?.teamCount ?? 0}
          icon={FolderTree}
          color="#10b981"
        />
        <StatCard
          label="Pending Invites"
          value={stats?.pendingInvites ?? 0}
          icon={Mail}
          color="#f59e0b"
        />
        <StatCard
          label="Apps"
          value={stats?.appCount ?? 0}
          icon={AppWindow}
          color="#8b5cf6"
        />
      </div>
    </div>
  );
}
