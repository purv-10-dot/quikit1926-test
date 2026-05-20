"use client";

import { use } from "react";
import { Card } from "@quikit/ui";
import { RolePermissionMatrix } from "./_components/role-permission-matrix";
import { RoleNavigationPanel } from "./_components/role-navigation-panel";
import { RoleMembersPanel } from "./_components/role-members-panel";

export default function RoleEditorPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  // Next 15 may pass params as a thenable. Tolerate both shapes.
  const resolved =
    typeof (params as Promise<{ id: string }>).then === "function"
      ? use(params as Promise<{ id: string }>)
      : (params as { id: string });
  const roleId = resolved.id;

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="text-base font-semibold mb-2">Permissions</h2>
        <RolePermissionMatrix roleId={roleId} />
      </Card>
      <Card className="p-4">
        <h2 className="text-base font-semibold mb-2">Navigation</h2>
        <RoleNavigationPanel roleId={roleId} />
      </Card>
      <Card className="p-4">
        <h2 className="text-base font-semibold mb-2">Members</h2>
        <RoleMembersPanel roleId={roleId} />
      </Card>
    </div>
  );
}
