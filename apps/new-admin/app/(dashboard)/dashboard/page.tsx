"use client";

import { useEffect, useState } from "react";
import StatCard from "@/components/dashboard/stat-card";
import { Users, UsersRound, Mail, LayoutGrid } from "lucide-react";

interface Stats { members: number; teams: number; invites: number; apps: number }

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((res) => { if (res.success) setStats(res.data); });
  }, []);

  const val = (n?: number) => n ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Overview</h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
          Organisation management at a glance
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Members"
          value={val(stats?.members)}
          icon={<Users className="h-5 w-5" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
        />
        <StatCard
          label="Teams"
          value={val(stats?.teams)}
          icon={<UsersRound className="h-5 w-5" />}
          iconBg="bg-green-50"
          iconColor="text-green-500"
        />
        <StatCard
          label="Pending Invites"
          value={val(stats?.invites)}
          icon={<Mail className="h-5 w-5" />}
          iconBg="bg-amber-50"
          iconColor="text-amber-500"
        />
        <StatCard
          label="Apps"
          value={val(stats?.apps)}
          icon={<LayoutGrid className="h-5 w-5" />}
          iconBg="bg-purple-50"
          iconColor="text-purple-500"
        />
      </div>
    </div>
  );
}
