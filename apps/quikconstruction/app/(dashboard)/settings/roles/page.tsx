"use client";

import { ShieldCheck } from "lucide-react";
import { PageHeader, PageContainer, EmptyState } from "@/components/PageShell";
import { ROLES, getPermissionsForRole, type ConstructionRole } from "@/lib/permissions";

export default function RolesPage() {
  const roles = Object.entries(ROLES);

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        subtitle="View and configure role-based access control"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Roles" }]}
      />
      <PageContainer>
        <div className="space-y-4">
          {roles.map(([key, value]) => {
            const permissions = getPermissionsForRole(value as ConstructionRole);
            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {key.replace(/_/g, " ")}
                      </h3>
                      <p className="text-xs text-gray-500">{permissions.length} permissions</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {permissions.slice(0, 12).map((p) => (
                    <span key={p} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
                      {p.replace("construction.", "")}
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
