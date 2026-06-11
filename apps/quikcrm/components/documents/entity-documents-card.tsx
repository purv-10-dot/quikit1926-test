"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityDocumentsPanel } from "@/components/documents/entity-documents-panel";
import type { DocumentRefType } from "@/lib/services/documents/types";

interface Props {
  refType: DocumentRefType;
  entityId: string;
  readOnly?: boolean;
  className?: string;
}

export function EntityDocumentsCard({ refType, entityId, readOnly, className }: Props) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardBody>
        <EntityDocumentsPanel refType={refType} entityId={entityId} readOnly={readOnly} />
      </CardBody>
    </Card>
  );
}
