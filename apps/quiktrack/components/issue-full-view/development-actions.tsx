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
  variant = "list",
}: {
  issueId: string;
  issueKey: string;
  onBranchCreated: () => void;
  /** "list" = Jira-style labeled blue links (default); "toolbar" = icon buttons. */
  variant?: "list" | "toolbar";
}) {
  const [dialog, setDialog] = useState<null | "branch" | "commit" | "pr" | "open">(null);
  const { data: repos = [] } = useQuery({
    queryKey: ["quiktrack", "linked-repos-for-actions"],
    queryFn: fetchLinkedRepos,
    staleTime: 60_000,
  });

  const actions = (
    <>
      <ActionItem variant={variant} onClick={() => setDialog("open")} icon={Terminal} label="Open in coding tool" />
      <ActionItem variant={variant} onClick={() => setDialog("branch")} icon={GitBranch} label="Create branch" />
      <ActionItem variant={variant} onClick={() => setDialog("commit")} icon={Copy} label="Create commit" />
      <ActionItem variant={variant} onClick={() => setDialog("pr")} icon={GitPullRequest} label="Create pull request" />
    </>
  );

  return (
    <div className={variant === "list" ? "flex flex-col gap-1" : "flex items-center gap-1"}>
      {actions}

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

function ActionItem({
  onClick,
  icon: Icon,
  label,
  variant,
}: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  variant: "list" | "toolbar";
}) {
  if (variant === "toolbar") {
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
  // Jira-style labeled blue link row.
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded px-1 py-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 hover:underline dark:text-accent-400"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
