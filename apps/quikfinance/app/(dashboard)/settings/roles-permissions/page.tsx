"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";

const ROLE_DESCRIPTIONS: Record<string, { label: string; description: string; color: string }> = {
  owner: { label: "Owner", description: "Full access including billing and organization settings.", color: "bg-purple-100 text-purple-700" },
  admin: { label: "Admin", description: "Full access to all modules except org-level settings.", color: "bg-blue-100 text-blue-700" },
  accountant: { label: "Accountant", description: "Create, edit, and approve accounting and tax entries.", color: "bg-green-100 text-green-700" },
  member: { label: "Member", description: "Create and edit own documents, view reports.", color: "bg-yellow-100 text-yellow-700" },
  viewer: { label: "Viewer", description: "Read-only access across all modules.", color: "bg-gray-100 text-gray-700" }
};

const MODULES = ["sales", "purchases", "banking", "accounting", "settings", "reports", "inventory"];

export default function RolesPermissionsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<{ id: string; role: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await fetch("/api/v1/settings/roles");
      return res.json();
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch("/api/v1/settings/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setEditingUser(null);
    }
  });

  const members = data?.data?.members ?? [];
  const roleMatrix = data?.data?.role_matrix ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Roles & Permissions", "Roles & Permissions")}
        description="Manage team member roles and review what each role can do across modules."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(ROLE_DESCRIPTIONS).map(([role, meta]) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{meta.label}</CardTitle>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${meta.color}`}>{role}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">{meta.description}</p>
              {roleMatrix[role] && (
                <div className="space-y-1">
                  {MODULES.map((mod) => {
                    const perms: string[] = roleMatrix[role][mod] ?? [];
                    return (
                      <div key={mod} className="flex items-center justify-between text-xs">
                        <span className="capitalize text-muted-foreground">{mod}</span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {perms.map((p) => (
                            <span key={p} className="bg-muted px-1 rounded text-xs">{p}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Team Members</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
              {members.map((m: Record<string, unknown>) => (
                <tr key={String(m.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{String(m.full_name ?? "—")}</td>
                  <td className="px-4 py-3">
                    {editingUser?.id === String(m.id) ? (
                      <select
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                        value={editingUser.role}
                        onChange={(e) => setEditingUser({ id: String(m.id), role: e.target.value })}
                      >
                        {Object.keys(ROLE_DESCRIPTIONS).map((r) => (
                          <option key={r} value={r}>{ROLE_DESCRIPTIONS[r].label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${ROLE_DESCRIPTIONS[String(m.role)]?.color ?? "bg-muted text-muted-foreground"}`}>
                        {ROLE_DESCRIPTIONS[String(m.role)]?.label ?? String(m.role)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingUser?.id === String(m.id) ? (
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" onClick={() => updateRoleMutation.mutate({ userId: String(m.id), role: editingUser.role })} disabled={updateRoleMutation.isPending}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setEditingUser({ id: String(m.id), role: String(m.role) })}>
                        Change Role
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
