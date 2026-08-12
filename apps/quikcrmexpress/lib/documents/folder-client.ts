import type { DocumentRefType } from "@/lib/services/documents/types";
import {
  decodeLocation,
  encodeLocation,
  isGlobalFolderScope,
  type ExplorerLocation,
} from "@/lib/services/document-folders/explorer-location";
import type {
  ExplorerTreeNodeDto,
  FolderContentsResult,
  FolderScope,
  FolderTreeNodeDto,
  GlobalExplorerContentsResult,
} from "@/lib/services/document-folders/types";

export { isGlobalFolderScope, encodeLocation, decodeLocation };
export type { ExplorerLocation };

export function folderScopeParams(scope: FolderScope): string {
  const p = new URLSearchParams();
  if (scope.refType && scope.refId) {
    p.set("refType", scope.refType);
    p.set("refId", scope.refId);
  }
  return p.toString();
}

function aggregateParams(): URLSearchParams {
  const p = new URLSearchParams();
  p.set("aggregate", "1");
  return p;
}

export function contentsUrl(
  scope: FolderScope,
  folderId: string | null,
  extra?: Record<string, string>,
): string {
  const p = isGlobalFolderScope(scope)
    ? aggregateParams()
    : new URLSearchParams(folderScopeParams(scope));
  if (!isGlobalFolderScope(scope)) {
    p.set("folderId", folderId ?? "null");
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
  }
  return `/api/document-folders?${p}`;
}

export function globalContentsUrl(
  location: ExplorerLocation,
  extra?: Record<string, string>,
): string {
  const p = aggregateParams();
  p.set("location", encodeLocation(location));
  if (extra) {
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
  }
  return `/api/document-folders?${p}`;
}

export function treeUrl(scope: FolderScope, parentFolderId: string | null): string {
  const p = isGlobalFolderScope(scope)
    ? aggregateParams()
    : new URLSearchParams(folderScopeParams(scope));
  p.set("tree", "1");
  if (isGlobalFolderScope(scope)) {
    p.set("parentId", parentFolderId ?? "null");
  } else {
    p.set("parentFolderId", parentFolderId ?? "null");
  }
  return `/api/document-folders?${p}`;
}

async function parseJson<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Request failed");
  }
  return json.data as T;
}

export async function fetchFolderContents(
  scope: FolderScope,
  folderId: string | null,
  q?: string,
): Promise<FolderContentsResult> {
  const extra: Record<string, string> = {};
  if (q?.trim()) extra.q = q.trim();
  const res = await fetch(contentsUrl(scope, folderId, extra));
  return parseJson(res);
}

export async function fetchGlobalExplorerContents(
  location: ExplorerLocation,
  q?: string,
): Promise<GlobalExplorerContentsResult> {
  const extra: Record<string, string> = {};
  if (q?.trim()) extra.q = q.trim();
  const res = await fetch(globalContentsUrl(location, extra));
  return parseJson(res);
}

export async function fetchTreeChildren(
  scope: FolderScope,
  parentFolderId: string | null,
): Promise<FolderTreeNodeDto[]> {
  const res = await fetch(treeUrl(scope, parentFolderId));
  const data = await parseJson<{ folders: FolderTreeNodeDto[] }>(res);
  return data.folders;
}

export async function fetchGlobalTreeChildren(
  parentId: string | null,
): Promise<ExplorerTreeNodeDto[]> {
  const res = await fetch(treeUrl({ refType: null, refId: null }, parentId));
  const data = await parseJson<{ folders: ExplorerTreeNodeDto[] }>(res);
  return data.folders;
}

export async function createFolderApi(input: {
  name: string;
  parentFolderId?: string | null;
  refType?: DocumentRefType | null;
  refId?: string | null;
}): Promise<import("@/lib/services/document-folders/types").FolderDto> {
  const res = await fetch("/api/document-folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function renameFolderApi(id: string, name: string): Promise<import("@/lib/services/document-folders/types").FolderDto> {
  const res = await fetch(`/api/document-folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parseJson(res);
}

export async function deleteFolderApi(id: string, recursive: boolean): Promise<void> {
  const res = await fetch(`/api/document-folders/${id}?recursive=${recursive}`, {
    method: "DELETE",
  });
  await parseJson(res);
}

export async function moveFolderApi(id: string, parentFolderId: string | null): Promise<void> {
  const res = await fetch(`/api/document-folders/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentFolderId }),
  });
  await parseJson(res);
}

export async function moveDocumentApi(documentId: string, folderId: string | null): Promise<void> {
  const res = await fetch(`/api/documents/${documentId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId }),
  });
  await parseJson(res);
}
