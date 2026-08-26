"use client";

import { RolePermissionMatrix } from "@/components/settings/roles/role-permission-matrix";
import { RoleMembersPanel } from "@/components/settings/roles/role-members-panel";

/** Permission matrix + member picker for one role. Used by RolesPanel. */
export function RoleEditor({ roleId }: { roleId: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-sm font-semibold">Permissions</h4>
        <RolePermissionMatrix roleId={roleId} />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold">Members</h4>
        <RoleMembersPanel roleId={roleId} />
      </div>
    </div>
  );
}
