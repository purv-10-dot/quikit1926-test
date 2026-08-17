"use client";

import { RequirePerm } from "@/components/shell/require-perm";
import { AuditLogView } from "@/components/audit-log/audit-log-view";

export default function AuditLogPage() {
  return (
    <RequirePerm adminOnly>
      <AuditLogView />
    </RequirePerm>
  );
}
