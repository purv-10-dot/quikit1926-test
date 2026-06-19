"use client";

import { use, useState } from "react";
import { MembersTab } from "./_components/members-tab";
import { ProjectRoleManagementTab } from "./_components/role-management-tab";
import { RequireProjectPerm } from "@/components/shell/require-project-perm";

export default function ProjectUserManagementPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolved =
    typeof (params as Promise<{ id: string }>).then === "function"
      ? use(params as Promise<{ id: string }>)
      : (params as { id: string });
  const projectId = resolved.id;

  const [tab, setTab] = useState<"members" | "roles">("members");

  return (
    <RequireProjectPerm projectId={projectId} resource="ProjectMember" action="view">
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 bg-white px-8 pt-2">
        <nav className="flex gap-6">
          {(["members", "roles"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`pb-3 text-sm font-medium border-b-2 -mb-px ${
                tab === k
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {k === "members" ? "Members" : "Project Roles"}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
        {tab === "members" ? (
          <MembersTab projectId={projectId} />
        ) : (
          <ProjectRoleManagementTab projectId={projectId} />
        )}
      </div>
    </div>
    </RequireProjectPerm>
  );
}
