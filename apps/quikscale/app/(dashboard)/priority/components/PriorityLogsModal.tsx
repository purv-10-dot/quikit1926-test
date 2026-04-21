"use client";

import { usePriorityLogs } from "@/lib/hooks/usePriority";
import type { PriorityRow } from "@/lib/types/priority";
import { LogsPanel, type LogEntry } from "@/components/LogsPanel";

interface Props { priority: PriorityRow; onClose: () => void; }

const FIELD_LABELS: Record<string, string> = {
  name: "Priority Name",
  description: "Description",
  owner: "Owner",
  teamId: "Team",
  quarter: "Quarter",
  year: "Year",
  startWeek: "Start Week",
  endWeek: "End Week",
  overallStatus: "Status",
  notes: "Notes",
};

export function PriorityLogsModal({ priority, onClose }: Props) {
  const { data: logs = [], isLoading } = usePriorityLogs(priority.id);
  return (
    <LogsPanel
      title={priority.name}
      subtitle="Change history"
      logs={logs as LogEntry[]}
      isLoading={isLoading}
      fieldLabels={FIELD_LABELS}
      onClose={onClose}
    />
  );
}
