"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { clientMemberFieldLabel } from "@/lib/audit/clientMemberFields";
import { PILLAR_TOKENS } from "@/components/audit/auditLogTokens";
import { useEntityAuditTimeline, useEntityMarkRead } from "@/lib/hooks/useAudit";
import { formatValue } from "@/lib/audit/timeline";
import type { AuditEntityConfig } from "@/components/audit/EntityChangeHistoryPanel";

/** Minimal Client Member shape the panel reads (the page's MemberRow is
 *  structurally assignable). */
export type ClientMemberAuditEntity = {
  id: string;
  name: string;
  email?: string;
};

/**
 * Client Member entity config. Single-row entity with just name + email — no
 * status, no period chip, no comments, no weekly.
 */
export const clientMemberAuditConfig: AuditEntityConfig<ClientMemberAuditEntity> = {
  entityType: "CLIENT_MEMBER",
  badgeLabel: "MEMBER",
  badgeColor: PILLAR_TOKENS.cadence,
  dialogLabel: "Client member change history",
  exportPrefix: "client-member",
  fieldLabel: clientMemberFieldLabel,
  useTimeline: (id) => useEntityAuditTimeline("CLIENT_MEMBER", id),
  useMarkRead: () => useEntityMarkRead("CLIENT_MEMBER"),
  useWeekLabels: () => [],
  renderCreateCard: ({ entity, open, onToggle }) => (
    <ClientMemberCreateCard member={entity} open={open} onToggle={onToggle} />
  ),
};

function ClientMemberCreateCard({
  member,
  open,
  onToggle,
}: {
  member: ClientMemberAuditEntity;
  open: boolean;
  onToggle: () => void;
}) {
  const fields: [string, unknown][] = [
    ["Name", member.name],
    ["Email", member.email],
  ];
  return (
    <div>
      <button type="button" onClick={onToggle} className="mb-1 flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700">
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? "Hide" : "Show"} details
      </button>
      {open && (
        <div className="space-y-1 text-sm">
          {fields
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([label, v]) => (
              <div key={label} className="flex gap-2">
                <span className="w-20 shrink-0 text-gray-500">{label}</span>
                <span className="break-words font-medium text-gray-900">{formatValue(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
