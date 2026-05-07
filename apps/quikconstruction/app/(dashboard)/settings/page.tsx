"use client";

import { useRouter } from "next/navigation";
import { UserCog, Workflow } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/PageShell";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader title="Settings" subtitle="User management and workflow configuration" />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: "Users", desc: "Manage users, assign modules and projects", href: "/settings/users", icon: UserCog, color: "bg-blue-50 text-blue-600" },
            { label: "Approval Workflows", desc: "Define multi-level approval routing", href: "/settings/workflows", icon: Workflow, color: "bg-purple-50 text-purple-600" },
          ].map((m) => (
            <button key={m.href} onClick={() => router.push(m.href)}
              className="flex flex-col p-5 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left">
              <div className={`w-10 h-10 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                <m.icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-gray-900">{m.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
