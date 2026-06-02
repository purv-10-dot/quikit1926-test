"use client";

import { ShieldCheck } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { ROLE_DEFINITIONS } from "@/lib/rbac/roles";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac/permissions";

export default function RolesPage() {
  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        subtitle="View and configure role-based access control"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Roles" }]}
      />
      <PageContainer>
        <div className="space-y-4">
          {ROLE_DEFINITIONS.map((role) => {
            const permissions =
              role.permissions === "*" ? ALL_PERMISSION_KEYS : role.permissions;
            return (
              <div key={role.key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{role.name}</h3>
                      <p className="text-xs text-gray-500">
                        {permissions.length} permissions · <span className="font-mono">{role.key}</span>
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-3">{role.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {permissions.slice(0, 12).map((p) => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
                      {p}
                    </span>
                  ))}
                  {permissions.length > 12 && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                      +{permissions.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PageContainer>
    </>
  );
}
