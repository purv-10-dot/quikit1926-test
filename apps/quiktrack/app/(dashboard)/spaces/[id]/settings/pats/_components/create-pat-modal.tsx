"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Input,
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
  Button,
} from "@quikit/ui";

export function CreatePatModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(<CreatePatDrawer projectId={projectId} onClose={onClose} />, document.body);
}

function CreatePatDrawer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  // The raw token is returned exactly once by the create call. Held only in
  // local component state while the success view is visible — never
  // persisted, and gone the moment this drawer closes.
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const trimmedName = name.trim();

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/pats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, expiresInDays }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to create token");
      return j.data as { token: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "space-pats", projectId] });
      setCreatedToken(data.token);
    },
    onError: (e: Error) => setError(e.message),
  });

  async function copyToken() {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked; the token is still selectable/copyable by hand.
    }
  }

  // ── Success view — one-time raw-token reveal ──
  if (createdToken) {
    return (
      <RightPanel
        open
        onClose={onClose}
        title="Token created"
        subtitle="Copy it now — it can't be shown again"
        size="sm"
        footer={
          <RightPanelFooter>
            <Button onClick={onClose}>Done</Button>
          </RightPanelFooter>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-900 dark:text-gray-100">{trimmedName}</span> — paste
          this into your MCP client&apos;s Bearer token config. QuikTrack does not store it in a form
          that can be read back — if you lose it, you&apos;ll need to revoke this token and create a new
          one.
        </p>
        <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Personal access token
          </div>
          <div className="mt-1 break-all font-mono text-sm text-gray-900 dark:text-gray-100">
            {createdToken}
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={copyToken}>{copied ? "Copied!" : "Copy token"}</Button>
        </div>
      </RightPanel>
    );
  }

  return (
    <RightPanel
      open
      onClose={onClose}
      title="New personal access token"
      subtitle="Lets an MCP client (e.g. Claude Code) act on this project as you"
      size="sm"
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={() => mut.mutate()}
            label={mut.isPending ? "Creating…" : "Create token"}
            saving={mut.isPending}
            disabled={mut.isPending || trimmedName.length === 0}
          />
        </RightPanelFooter>
      }
    >
      <Input
        label="Name"
        placeholder="e.g. Claude Code — laptop"
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Helps you tell tokens apart later — this is shown in the list, the raw token never is.
      </p>
      <div className="mt-4">
        <Input
          label="Expires in (days)"
          type="number"
          min={1}
          max={365}
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(Number(e.target.value))}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          1–365 days. There is no non-expiring option.
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </RightPanel>
  );
}
