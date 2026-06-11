import type { DocumentDto, DocumentRefType } from "@/lib/services/documents/types";
import type { ExplorerModuleKey } from "./explorer-location";

export interface FolderScope {
  /** Entity scope; omit both for tenant-global folders */
  refType?: DocumentRefType | null;
  refId?: string | null;
}

export interface FolderDto {
  id: string;
  name: string;
  parentFolderId: string | null;
  refType: DocumentRefType | null;
  refId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  childFolderCount?: number;
  fileCount?: number;
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
  /** Serialized explorer location or virtual tree id for navigation */
  navKey?: string | null;
  href?: string | null;
}

export interface FolderTreeNodeDto extends FolderDto {
  hasChildren: boolean;
}

export type ExplorerTreeNodeKind = "module" | "entity" | "folder";

export interface ExplorerTreeNodeDto extends FolderTreeNodeDto {
  nodeKind: ExplorerTreeNodeKind;
  relatedHref?: string | null;
  moduleKey?: ExplorerModuleKey;
}

export interface ExplorerModuleDto {
  module: ExplorerModuleKey;
  label: string;
  navKey: string;
}

export interface ExplorerEntityDto {
  refType: DocumentRefType;
  refId: string;
  label: string;
  href: string;
  navKey: string;
}

export interface GlobalExplorerContentsResult extends FolderContentsResult {
  modules: ExplorerModuleDto[];
  entities: ExplorerEntityDto[];
  totalEntities: number;
}

export interface FolderContentsResult {
  folder: FolderDto | null;
  breadcrumbs: BreadcrumbItem[];
  folders: FolderDto[];
  files: DocumentDto[];
  totalFolders: number;
  totalFiles: number;
  page: number;
  pageSize: number;
}

export interface CreateFolderInput {
  name: string;
  parentFolderId?: string | null;
  refType?: DocumentRefType | null;
  refId?: string | null;
}

export interface UpdateFolderInput {
  name: string;
}

export interface MoveFolderInput {
  parentFolderId: string | null;
}

export interface MoveDocumentInput {
  folderId: string | null;
}
