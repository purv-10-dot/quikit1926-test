"use client";

import { DocumentFolderExplorer } from "@/components/documents/document-folder-explorer";

export function DocumentsLibraryClient() {
  return <DocumentFolderExplorer scope={{ refType: null, refId: null }} />;
}
