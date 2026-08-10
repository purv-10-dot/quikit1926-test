"use client";

import { DocumentFolderExplorer } from "@/components/documents/document-folder-explorer";
import type { DocumentRefType } from "@/lib/services/documents/types";

interface Props {
  refType: DocumentRefType;
  entityId: string;
  readOnly?: boolean;
}

export function EntityDocumentsPanel({ refType, entityId, readOnly = false }: Props) {
  return (
    <DocumentFolderExplorer
      scope={{ refType, refId: entityId }}
      readOnly={readOnly}
    />
  );
}
