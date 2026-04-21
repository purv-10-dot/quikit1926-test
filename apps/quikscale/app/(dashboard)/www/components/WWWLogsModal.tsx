"use client";

import { useWWWLogs } from "@/lib/hooks/useWWW";
import type { WWWItem } from "@/lib/types/www";
import { LogsPanel, type LogEntry } from "@/components/LogsPanel";

interface Props { item: WWWItem; onClose: () => void; }

const FIELD_LABELS: Record<string, string> = {
  who: "Who",
  what: "What",
  when: "When",
  status: "Status",
  notes: "Notes",
  category: "Category",
  originalDueDate: "Original Due Date",
  revisedDates: "Revised Dates",
};

// Headline for the WWW item — prefer "what" (the task description) over id
function headline(item: WWWItem): string {
  return item.what || "WWW Item";
}

export function WWWLogsModal({ item, onClose }: Props) {
  const { data: logs = [], isLoading } = useWWWLogs(item.id);
  return (
    <LogsPanel
      title={headline(item)}
      subtitle="Change history"
      logs={logs as LogEntry[]}
      isLoading={isLoading}
      fieldLabels={FIELD_LABELS}
      onClose={onClose}
    />
  );
}
