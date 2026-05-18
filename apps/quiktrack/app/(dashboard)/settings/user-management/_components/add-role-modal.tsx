"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Input,
  Textarea,
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
} from "@quikit/ui";

export function AddRoleModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<AddRoleDrawer onClose={onClose} />, document.body);
}

function AddRoleDrawer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/org/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, isDefault }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-roles"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <RightPanel
      open
      onClose={onClose}
      title="New Role"
      subtitle="Define a role and assign it to users from the Users tab"
      size="sm"
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={() => mut.mutate()}
            label={mut.isPending ? "Creating…" : "Add Role"}
            saving={mut.isPending}
            disabled={!name || mut.isPending}
          />
        </RightPanelFooter>
      }
    >
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Accountability User"
      />
      <label className="block text-sm">
        <span className="text-gray-700 mb-1 block">Description</span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this role for?"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="h-4 w-4"
        />
        Use as default role for newly invited users
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </RightPanel>
  );
}
