"use client";

import { EntityChangeHistoryPanel } from "@/components/audit/EntityChangeHistoryPanel";
import { clientMemberAuditConfig, type ClientMemberAuditEntity } from "@/components/audit/clientMemberAuditConfig";

/**
 * Client Member Change History drawer — thin wrapper over the shared
 * EntityChangeHistoryPanel, driven by clientMemberAuditConfig.
 */
export function ClientMemberChangeHistoryPanel({
  member,
  onClose,
}: {
  member: ClientMemberAuditEntity;
  onClose: () => void;
}) {
  return <EntityChangeHistoryPanel entity={member} config={clientMemberAuditConfig} onClose={onClose} />;
}
