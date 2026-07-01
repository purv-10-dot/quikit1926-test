"use client";

import { useMemo } from "react";
import {
  EntityChangeHistoryPanel,
  type AuditEntityConfig,
} from "@/components/audit/EntityChangeHistoryPanel";
import { clientAuditConfig, type ClientAuditEntity } from "@/components/audit/clientAuditConfig";

/**
 * Client Master Change History drawer — thin wrapper over the shared
 * EntityChangeHistoryPanel, driven by clientAuditConfig.
 *
 * `nameById` resolves clientMember ids → names so the "Team Members" add/remove
 * diff reads as names — including MIGRATED entries whose AuditChange rows store
 * raw ids. Live entries already store names and pass through unchanged.
 */
export function ClientChangeHistoryPanel({
  client,
  nameById,
  onClose,
}: {
  client: ClientAuditEntity;
  nameById?: Map<string, string>;
  onClose: () => void;
}) {
  const config = useMemo<AuditEntityConfig<ClientAuditEntity>>(
    () => ({
      ...clientAuditConfig,
      formatFieldValue: (field, value) => {
        // isActive → Active/Inactive (from the base config).
        const base = clientAuditConfig.formatFieldValue?.(field, value);
        if (base !== undefined) return base;
        // teamMemberIds → member name (falls back to the raw value).
        if (field === "teamMemberIds" && value != null) {
          const s = String(value);
          return nameById?.get(s) ?? s;
        }
        return undefined;
      },
    }),
    [nameById],
  );

  return <EntityChangeHistoryPanel entity={client} config={config} onClose={onClose} />;
}
