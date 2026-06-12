import type { DocumentRefType } from "@/lib/services/documents/types";
import type { FolderScope } from "./types";

export type ExplorerModuleKey = DocumentRefType | "global";

export type ExplorerLocation =
  | { kind: "root" }
  | { kind: "module"; module: ExplorerModuleKey }
  | { kind: "entity"; refType: DocumentRefType; refId: string }
  | { kind: "folder"; folderId: string };

export function isGlobalFolderScope(scope: FolderScope): boolean {
  return !scope.refType && !scope.refId;
}

export function encodeLocation(loc: ExplorerLocation): string {
  switch (loc.kind) {
    case "root":
      return "root";
    case "module":
      return `module:${loc.module}`;
    case "entity":
      return `entity:${loc.refType}:${loc.refId}`;
    case "folder":
      return `folder:${loc.folderId}`;
  }
}

export function decodeLocation(raw: string | null | undefined): ExplorerLocation {
  if (!raw || raw === "root") return { kind: "root" };
  if (raw.startsWith("module:")) {
    const module = raw.slice("module:".length) as ExplorerModuleKey;
    return { kind: "module", module };
  }
  if (raw.startsWith("entity:")) {
    const parts = raw.split(":");
    const refType = parts[1] as DocumentRefType;
    const refId = parts.slice(2).join(":");
    return { kind: "entity", refType, refId };
  }
  if (raw.startsWith("folder:")) {
    return { kind: "folder", folderId: raw.slice("folder:".length) };
  }
  return { kind: "root" };
}

export function locationToScope(loc: ExplorerLocation): FolderScope | null {
  if (loc.kind === "entity") {
    return { refType: loc.refType, refId: loc.refId };
  }
  if (loc.kind === "folder") {
    return null;
  }
  return null;
}

/** Virtual tree node ids (sidebar lazy load). */
export const VIRTUAL_PREFIX = "v:" as const;

export function virtualModuleId(module: ExplorerModuleKey): string {
  return `${VIRTUAL_PREFIX}module:${module}`;
}

export function virtualEntityId(refType: DocumentRefType, refId: string): string {
  return `${VIRTUAL_PREFIX}entity:${refType}:${refId}`;
}

export function parseVirtualTreeParentId(parentId: string | null): {
  kind: "root" | "module" | "entity" | "folder";
  module?: ExplorerModuleKey;
  refType?: DocumentRefType;
  refId?: string;
  folderId?: string;
} {
  if (!parentId) return { kind: "root" };
  if (!parentId.startsWith(VIRTUAL_PREFIX)) {
    return { kind: "folder", folderId: parentId };
  }
  const body = parentId.slice(VIRTUAL_PREFIX.length);
  if (body.startsWith("module:")) {
    return { kind: "module", module: body.slice("module:".length) as ExplorerModuleKey };
  }
  if (body.startsWith("entity:")) {
    const parts = body.split(":");
    return {
      kind: "entity",
      refType: parts[1] as DocumentRefType,
      refId: parts.slice(2).join(":"),
    };
  }
  return { kind: "root" };
}

export function isVirtualTreeNodeId(id: string): boolean {
  return id.startsWith(VIRTUAL_PREFIX);
}
