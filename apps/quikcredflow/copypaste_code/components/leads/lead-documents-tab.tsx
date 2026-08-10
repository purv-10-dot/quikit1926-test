"use client";

import { EntityDocumentsPanel } from "@/components/documents/entity-documents-panel";

export function LeadDocumentsTab({ leadId }: { leadId: string }) {
  return <EntityDocumentsPanel refType="lead" entityId={leadId} />;
}
