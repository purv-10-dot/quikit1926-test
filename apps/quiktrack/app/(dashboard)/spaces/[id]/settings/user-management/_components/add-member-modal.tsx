"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
} from "@quikit/ui";
import { StyledSelect } from "./styled-select";
import { RolePicker } from "./role-picker";
import { emitMembersChanged } from "@/lib/hooks/useMembersChanged";

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ProjectRole {
  id: string;
  name: string;
  isDefault?: boolean;
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
      emitMembersChanged(projectId);
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
      <StyledSelect
        label="User"
        value={userId}
        onChange={setUserId}
        placeholder="Select a user…"
        searchable
        searchPlaceholder="Search by name or email…"
        options={users.map((u) => ({
          value: u.userId,
          label: `${u.firstName} ${u.lastName}`.trim() || u.email,
          sub: u.email,
        }))}
      />
      <StyledSelect
        label="Membership tier (legacy)"
        value={legacyRole}
        onChange={setLegacyRole}
        options={[
          { value: "PROJECT_ADMIN", label: "Project Admin", sub: "Full project administration" },
          { value: "MEMBER", label: "Member", sub: "Default tier" },
          { value: "VIEWER", label: "Viewer", sub: "Read-only" },
        ]}
      />
      <div>
        <span className="text-sm text-gray-700 mb-1 block">Project role</span>
        <RolePicker
          value={projectRoleId || null}
          roles={roles}
          onChange={(next) => setProjectRoleId(next ?? "")}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </RightPanel>
  );
}
