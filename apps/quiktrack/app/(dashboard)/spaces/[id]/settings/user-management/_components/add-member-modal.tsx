"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
} from "@quikit/ui";

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ProjectRole {
  id: string;
  name: string;
}

export function AddMemberModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<Drawer projectId={projectId} onClose={onClose} />, document.body);
}

function Drawer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [legacyRole, setLegacyRole] = useState("MEMBER");
  const [projectRoleId, setProjectRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["quiktrack", "org-users-flat"],
    queryFn: async () => {
      const r = await fetch("/api/org/users");
      const j = await r.json();
      return ((j.data as OrgUser[]) ?? []);
    },
  });

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "project-roles", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles`);
      const j = await r.json();
      return (j.data as ProjectRole[]) ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: legacyRole }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      if (projectRoleId) {
        const rr = await fetch(`/api/projects/${projectId}/members/${userId}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectRoleId }),
        });
        if (!rr.ok) throw new Error((await rr.json()).error ?? "Failed to set role");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "project-members", projectId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const users = usersQ.data ?? [];
  const roles = rolesQ.data ?? [];

  return (
    <RightPanel
      open
      onClose={onClose}
      title="Add Project Member"
      subtitle="Pick an org member and assign their project role"
      size="sm"
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={() => mut.mutate()}
            label={mut.isPending ? "Adding…" : "Add Member"}
            saving={mut.isPending}
            disabled={!userId || mut.isPending}
          />
        </RightPanelFooter>
      }
    >
      <label className="block text-sm">
        <span className="text-gray-700 mb-1 block">User</span>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full h-9 px-3 text-sm border border-gray-200 rounded"
        >
          <option value="">Select a user…</option>
          {users.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.firstName} {u.lastName} — {u.email}
            </option>
          ))}
        </select>
      </label>
      <Select
        label="Membership tier (legacy)"
        value={legacyRole}
        onChange={(e) => setLegacyRole(e.target.value)}
        options={[
          { value: "PROJECT_ADMIN", label: "Project Admin" },
          { value: "MEMBER", label: "Member" },
          { value: "VIEWER", label: "Viewer" },
        ]}
      />
      <Select
        label="Project role"
        value={projectRoleId}
        onChange={(e) => setProjectRoleId(e.target.value)}
        options={[
          { value: "", label: "— None (only membership) —" },
          ...roles.map((r) => ({ value: r.id, label: r.name })),
        ]}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </RightPanel>
  );
}
