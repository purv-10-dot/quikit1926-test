"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, GitBranch, GitPullRequest, Terminal } from "lucide-react";
import {
  BranchDialog,
  CommitDialog,
  PrDialog,
  OpenToolDialog,
  type LinkedRepo,
} from "./development-dialogs";

async function fetchLinkedRepos(): Promise<LinkedRepo[]> {
  // The repos endpoint returns linked repos without an installationId param.
  const r = await fetch("/api/integrations/github/repos");
  const j = await r.json();
  if (!r.ok || !j.success) return [];
  return (j.data.linked as LinkedRepo[]).filter((x) => x.isActive);
}

/**
 * Action buttons for the Development section: create branch / commit / pull
 * request / open in coding tool. Each opens a dialog (in development-dialogs).
 */
export function DevelopmentActions({
  issueId,
  issueKey,
  onBranchCreated,
}: {
  issueId: string;
  issueKey: string;
  onBranchCreated: () => void;
}) {
  const [dialog, setDialog] = useState<null | "branch" | "commit" | "pr" | "open">(null);
  const { data: repos = [] } = useQuery({
    queryKey: ["quiktrack", "linked-repos-for-actions"],
    queryFn: fetchLinkedRepos,
    staleTime: 60_000,
  });

  return (
    <div className="flex items-center gap-1">
      <ActionButton onClick={() => setDialog("branch")} icon={GitBranch} label="Create branch" />
      <ActionButton onClick={() => setDialog("commit")} icon={Copy} label="Create commit" />
      <ActionButton onClick={() => setDialog("pr")} icon={GitPullRequest} label="Create pull request" />
      <ActionButton onClick={() => setDialog("open")} icon={Terminal} label="Open in coding tool" />

      {dialog === "branch" && (
        <BranchDialog
          issueId={issueId}
          issueKey={issueKey}
          repos={repos}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            onBranchCreated();
          }}
        />
      )}
      {dialog === "commit" && (
        <CommitDialog issueKey={issueKey} onClose={() => setDialog(null)} />
      )}
      {dialog === "pr" && (
        <PrDialog issueKey={issueKey} repos={repos} onClose={() => setDialog(null)} />
      )}
      {dialog === "open" && (
        <OpenToolDialog repos={repos} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
