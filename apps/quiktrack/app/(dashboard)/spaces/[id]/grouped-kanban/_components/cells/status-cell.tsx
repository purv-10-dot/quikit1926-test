"use client";

import type { GroupedBoardStatus } from "../../_types";
import { WorkflowStatusControl } from "@/components/workflow-status-control";

interface StatusCellProps {
  issueId: string;
  projectId: string;
  value: string;
  statuses: GroupedBoardStatus[];
  onCommit: (statusId: string) => void;
}

export function StatusCell({ issueId, projectId, value, statuses, onCommit }: StatusCellProps) {
  const current = statuses.find((s) => s.id === value);
  return (
    <WorkflowStatusControl
      issueId={issueId}
      projectId={projectId}
      currentStatusId={value}
      currentStatusName={current?.name ?? "—"}
      currentStatusCategory={current?.category}
      statuses={statuses.map((s) => ({ id: s.id, name: s.name, category: s.category }))}
      onChange={onCommit}
      onViewWorkflow={() => window.open(`/spaces/${projectId}/settings/workflows`, "_blank")}
      size="sm"
    />
  );
}
