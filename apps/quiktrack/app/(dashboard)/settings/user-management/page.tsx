"use client";

import { useState } from "react";
import { UsersTab } from "./_components/users-tab";
import { RoleManagementTab } from "./_components/role-management-tab";
import { RequirePerm } from "@/components/shell/require-perm";

export default function UserManagementPage() {
  const [tab, setTab] = useState<"users" | "roles">("users");

  return (
    <RequirePerm adminOnly>
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 bg-white px-8 pt-2">
        <nav className="flex gap-6">
          {(["users", "roles"] as const).map((k) => (
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
              {k === "users" ? "Users" : "User Management"}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
        {tab === "users" ? <UsersTab /> : <RoleManagementTab />}
      </div>
    </div>
    </RequirePerm>
  );
}
