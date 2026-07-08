"use client";

import { useState } from "react";
import { ShieldCheck, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RequirePerm } from "@/components/require-perm";
import { UsersTab } from "./_components/users-tab";
import { RoleManagementTab } from "./_components/role-management-tab";
import { Toaster, useToast } from "./_components/shared";

type Tab = "users" | "roles";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "users", label: "Users", icon: Users2 },
  { key: "roles", label: "Roles & Permissions", icon: ShieldCheck },
];

export default function UserManagementPage() {
  const [tab, setTab] = useState<Tab>("users");
  const { toast, showToast, clearToast } = useToast();

  return (
    <RequirePerm adminOnly>
      <div className="p-4 sm:p-6">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-gray-900">User Management</h1>
          <p className="text-xs text-gray-500">
            Manage members, roles, and permissions for QuikAsset.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex gap-1 border-b border-gray-100 px-3 pt-2">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-semibold transition-colors",
                    active
                      ? "border-accent-600 text-accent-700"
                      : "border-transparent text-gray-500 hover:text-gray-700",
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "users" ? (
            <UsersTab showToast={showToast} />
          ) : (
            <RoleManagementTab showToast={showToast} />
          )}
        </div>
      </div>

      <Toaster toast={toast} onClose={clearToast} />
    </RequirePerm>
  );
}
