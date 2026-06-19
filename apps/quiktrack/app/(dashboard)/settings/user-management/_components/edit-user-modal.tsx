"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Input,
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
} from "@quikit/ui";
import { ProjectsPicker } from "./projects-picker";

interface EditUserTarget {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
}

interface UserDetails {
  teamIds: string[];
  projectIds: string[];
  status: string;
}

export function EditUserModal({
  user,
  onClose,
}: {
  user: EditUserTarget;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(<EditUserDrawer user={user} onClose={onClose} />, document.body);
}

function EditUserDrawer({
  user,
  onClose,
}: {
  user: EditUserTarget;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">(
    user.status === "inactive" ? "inactive" : "active",
  );
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Pull current team + project memberships to prefill the pickers.
  const detailsQ = useQuery({
    queryKey: ["quiktrack", "user-details", user.userId],
    queryFn: async () => {
      const r = await fetch(`/api/org/users/${user.userId}`);
      const j = await r.json();
      return (j.data as UserDetails) ?? { teamIds: [], projectIds: [], status: "active" };
    },
  });

  useEffect(() => {
    if (!detailsQ.data || hydrated) return;
    setTeamIds(detailsQ.data.teamIds);
    setProjectIds(detailsQ.data.projectIds);
    setHydrated(true);
  }, [detailsQ.data, hydrated]);

  const mut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        firstName,
        lastName,
        status,
        teamIds,
        projectIds,
      };
      if (password.length > 0) body.password = password;
      const r = await fetch(`/api/org/users/${user.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    (password.length === 0 || password.length >= 8);

  return (
    <RightPanel
      open
      onClose={onClose}
      title="Edit User"
      subtitle={user.email}
      size="sm"
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={() => mut.mutate()}
            label={mut.isPending ? "Saving…" : "Save Changes"}
            saving={mut.isPending}
            disabled={!canSubmit || mut.isPending}
          />
        </RightPanelFooter>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Jane"
        />
        <Input
          label="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Doe"
        />
      </div>

      <div>
        <label className="block text-sm">
          <span className="text-gray-700 mb-1 block">Email</span>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
          />
        </label>
        <p className="mt-1 text-[11px] text-gray-400">
          Email is the login identifier and can&apos;t be changed here.
        </p>
      </div>

      <Input
        label="Reset password (optional)"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Leave blank to keep current password"
      />

      <div>
        <span className="text-sm text-gray-700 mb-1 block">Status</span>
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setStatus("active")}
            className={`px-3 h-8 text-sm ${
              status === "active"
                ? "bg-green-50 text-green-700 font-medium"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatus("inactive")}
            className={`px-3 h-8 text-sm border-l border-gray-200 ${
              status === "inactive"
                ? "bg-gray-100 text-gray-700 font-medium"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      <ProjectsPicker
        selected={projectIds}
        onChange={setProjectIds}
        label="Projects"
        placeholder="No projects assigned"
      />
      <p className="-mt-2 text-[11px] text-gray-400">
        Removing a project soft-deletes their membership; re-adding restores it.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </RightPanel>
  );
}
