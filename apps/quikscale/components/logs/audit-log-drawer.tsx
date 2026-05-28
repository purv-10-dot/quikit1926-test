"use client";

/**
 * AuditLogDrawer — global RightPanel slide-in that shows AuditLog entries for
 * any entity. Mirrors the Daily Huddle "Meeting Details → Log" tab styling so
 * audit history looks the same everywhere.
 *
 * Fetches from GET /api/audit-logs?entityType=…&entityId=…&extra=… and renders
 * the result with <AuditLogList />. The `extra` query param scopes a single
 * entity's audit log to a sub-row (OPSP Review uses
 * `${horizon}|rowIndex=${i}` for primary rows, `${horizon}:secondary:row${i}`
 * for secondary rows, `${module}:${cardType}` for Critical # Review rows).
 */

import { useEffect, useState } from "react";
import { RightPanel } from "@quikit/ui";
import { AuditLogList, type AuditLogEntry } from "./audit-log-list";

export interface AuditLogDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  entityType: string;
  entityId: string;
  /** Optional filter passed as `?extra=…`; matched against AuditLog.reason. */
  extraQuery?: string;
  nameById?: (id: string) => string | undefined;
  fieldLabels?: Record<string, string>;
  emptyMessage?: string;
}

export function AuditLogDrawer({
  open,
  onClose,
  title,
  subtitle,
  entityType,
  entityId,
  extraQuery,
  nameById,
  fieldLabels,
  emptyMessage,
}: AuditLogDrawerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !entityId) return;
    let ok = true;
    setLoading(true);
    setEntries([]);
    const params = new URLSearchParams({ entityType, entityId });
    if (extraQuery) params.set("extra", extraQuery);
    fetch(`/api/audit-logs?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!ok) return;
        if (j?.success) setEntries(j.data as AuditLogEntry[]);
      })
      .catch(() => {})
      .finally(() => {
        if (ok) setLoading(false);
      });
    return () => {
      ok = false;
    };
  }, [open, entityType, entityId, extraQuery]);

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      subtitle={subtitle}
    >
      <AuditLogList
        entries={entries}
        loading={loading}
        nameById={nameById}
        fieldLabels={fieldLabels}
        emptyMessage={emptyMessage}
      />
    </RightPanel>
  );
}
