import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { assertDocumentParent, REF_CONFIG } from "@/lib/services/documents/ref-config";
import type { DocumentRefType } from "@/lib/services/documents/types";
import { listFolderContents } from "./folder-service";
import { toFolderDto } from "./serialize-folder";
import {
  decodeLocation,
  encodeLocation,
  type ExplorerLocation,
  type ExplorerModuleKey,
  parseVirtualTreeParentId,
  virtualEntityId,
  virtualModuleId,
} from "./explorer-location";
import {
  getModuleLabel,
  listEntityIdsForModule,
  resolveEntityLabels,
} from "./entity-labels";
import {
  globalModuleHasTreeChildren,
  listVisibleExplorerModules,
  moduleHasDocuments,
} from "./module-visibility";
import { enrichRelatedLabels } from "@/lib/services/documents/enrich-related";
import { toDocumentDto } from "@/lib/services/documents/serialize";
import { resolveUploaderNames } from "@/lib/services/documents/uploader-names";
import type {
  BreadcrumbItem,
  ExplorerEntityDto,
  ExplorerModuleDto,
  ExplorerTreeNodeDto,
  FolderContentsResult,
  GlobalExplorerContentsResult,
} from "./types";
import { FolderServiceError } from "./scope";

function toTreeNode(input: {
  id: string;
  name: string;
  nodeKind: ExplorerTreeNodeDto["nodeKind"];
  hasChildren: boolean;
  refType?: DocumentRefType | null;
  refId?: string | null;
  relatedHref?: string | null;
  moduleKey?: ExplorerModuleKey;
}): ExplorerTreeNodeDto {
  return {
    id: input.id,
    name: input.name,
    parentFolderId: null,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    createdBy: "",
    createdAt: "",
    updatedAt: "",
    hasChildren: input.hasChildren,
    nodeKind: input.nodeKind,
    relatedHref: input.relatedHref ?? null,
    moduleKey: input.moduleKey,
  };
}

/** Lazy global sidebar: virtual modules → entities → real folders. */
export async function listGlobalAggregatedTreeChildren(
  user: SessionUser,
  parentId: string | null,
  opts?: { page?: number; pageSize?: number },
): Promise<{ nodes: ExplorerTreeNodeDto[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts?.pageSize ?? 50));
  const parsed = parseVirtualTreeParentId(parentId);

  if (parsed.kind === "root") {
    const visibleModules = await listVisibleExplorerModules(user);
    const nodes = await Promise.all(
      visibleModules.map(async (module) =>
        toTreeNode({
          id: virtualModuleId(module),
          name: getModuleLabel(module),
          nodeKind: "module",
          hasChildren:
            module === "global"
              ? await globalModuleHasTreeChildren(user)
              : await moduleHasDocuments(user, module),
          moduleKey: module,
        }),
      ),
    );
    return { nodes, total: nodes.length, page: 1, pageSize: nodes.length };
  }

  if (parsed.kind === "module" && parsed.module) {
    if (parsed.module === "global") {
      const rows = await prisma.qcfDocumentFolder.findMany({
        where: {
          tenantId: user.tenantId,
          refType: null,
          refId: null,
          parentFolderId: null,
          deletedAt: null,
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          tenantId: true,
          name: true,
          parentFolderId: true,
          refType: true,
          refId: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          _count: { select: { children: { where: { deletedAt: null } } } },
        },
      });
      const nodes = rows.map((r) =>
        toTreeNode({
          id: r.id,
          name: r.name,
          nodeKind: "folder",
          hasChildren: r._count.children > 0,
          refType: null,
          refId: null,
        }),
      );
      return { nodes, total: nodes.length, page: 1, pageSize: nodes.length };
    }

    const refType = parsed.module as DocumentRefType;
    const allIds = await listEntityIdsForModule(user, refType);
    const total = allIds.length;
    const slice = allIds.slice((page - 1) * pageSize, page * pageSize);
    const labels = await resolveEntityLabels(user, refType, slice);

    const nodes = slice.map((refId) => {
      const meta = labels.get(refId);
      return toTreeNode({
        id: virtualEntityId(refType, refId),
        name: meta?.label ?? `${refType} ${refId.slice(0, 8)}…`,
        nodeKind: "entity",
        hasChildren: true,
        refType,
        refId,
        relatedHref: meta?.href ?? null,
        moduleKey: parsed.module,
      });
    });
    return { nodes, total, page, pageSize };
  }

  if (parsed.kind === "entity" && parsed.refType && parsed.refId) {
    await assertDocumentParent(user, parsed.refType, parsed.refId);
    const rows = await prisma.qcfDocumentFolder.findMany({
      where: {
        tenantId: user.tenantId,
        refType: parsed.refType,
        refId: parsed.refId,
        parentFolderId: null,
        deletedAt: null,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        tenantId: true,
        name: true,
        parentFolderId: true,
        refType: true,
        refId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        _count: { select: { children: { where: { deletedAt: null } } } },
      },
    });
    const nodes = rows.map((r) =>
      toTreeNode({
        id: r.id,
        name: r.name,
        nodeKind: "folder",
        hasChildren: r._count.children > 0,
        refType: parsed.refType!,
        refId: parsed.refId!,
      }),
    );
    return { nodes, total: nodes.length, page: 1, pageSize: nodes.length };
  }

  if (parsed.kind === "folder" && parsed.folderId) {
    const folder = await prisma.qcfDocumentFolder.findFirst({
      where: { id: parsed.folderId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!folder) throw new FolderServiceError("Folder not found", 404);
    if (folder.refType && folder.refId) {
      await assertDocumentParent(user, folder.refType as DocumentRefType, folder.refId);
    }

    const rows = await prisma.qcfDocumentFolder.findMany({
      where: {
        tenantId: user.tenantId,
        refType: folder.refType,
        refId: folder.refId,
        parentFolderId: folder.id,
        deletedAt: null,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        tenantId: true,
        name: true,
        parentFolderId: true,
        refType: true,
        refId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        _count: { select: { children: { where: { deletedAt: null } } } },
      },
    });
    const nodes = rows.map((r) =>
      toTreeNode({
        id: r.id,
        name: r.name,
        nodeKind: "folder",
        hasChildren: r._count.children > 0,
        refType: (r.refType as DocumentRefType | null) ?? null,
        refId: r.refId,
      }),
    );
    return { nodes, total: nodes.length, page: 1, pageSize: nodes.length };
  }

  return { nodes: [], total: 0, page, pageSize };
}

export async function buildGlobalExplorerBreadcrumbs(
  user: SessionUser,
  location: ExplorerLocation,
): Promise<BreadcrumbItem[]> {
  const crumbs: BreadcrumbItem[] = [
    { id: null, name: "Documents", navKey: encodeLocation({ kind: "root" }) },
  ];

  if (location.kind === "root") return crumbs;

  if (location.kind === "module") {
    crumbs.push({
      id: virtualModuleId(location.module),
      name: getModuleLabel(location.module),
      navKey: encodeLocation(location),
    });
    return crumbs;
  }

  if (location.kind === "entity") {
    const labels = await resolveEntityLabels(user, location.refType, [location.refId]);
    const meta = labels.get(location.refId);
    crumbs.push({
      id: virtualModuleId(location.refType),
      name: getModuleLabel(location.refType),
      navKey: encodeLocation({ kind: "module", module: location.refType }),
    });
    crumbs.push({
      id: virtualEntityId(location.refType, location.refId),
      name: meta?.label ?? location.refId.slice(0, 8),
      navKey: encodeLocation(location),
      href: meta?.href ?? null,
    });
    return crumbs;
  }

  if (location.kind === "folder") {
    const folder = await prisma.qcfDocumentFolder.findFirst({
      where: { id: location.folderId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, name: true, parentFolderId: true, refType: true, refId: true },
    });
    if (!folder) return crumbs;

    if (folder.refType && folder.refId) {
      const entityLoc: ExplorerLocation = {
        kind: "entity",
        refType: folder.refType as DocumentRefType,
        refId: folder.refId,
      };
      const base = await buildGlobalExplorerBreadcrumbs(user, entityLoc);
      const chain: { id: string; name: string; parentFolderId: string | null }[] = [];
      let cur: string | null = folder.id;
      const seen = new Set<string>();
      while (cur) {
        if (seen.has(cur)) break;
        seen.add(cur);
        const row: { id: string; name: string; parentFolderId: string | null } | null =
          await prisma.qcfDocumentFolder.findFirst({
          where: { id: cur, tenantId: user.tenantId, deletedAt: null },
          select: { id: true, name: true, parentFolderId: true },
        });
        if (!row) break;
        chain.unshift(row);
        cur = row.parentFolderId;
      }
      for (const row of chain) {
        base.push({
          id: row.id,
          name: row.name,
          navKey: encodeLocation({ kind: "folder", folderId: row.id }),
        });
      }
      return base;
    }

    crumbs.push({
      id: virtualModuleId("global"),
      name: getModuleLabel("global"),
      navKey: encodeLocation({ kind: "module", module: "global" }),
    });
    let curId: string | null = folder.id;
    const folderCrumbs: BreadcrumbItem[] = [];
    const seen = new Set<string>();
    while (curId) {
      if (seen.has(curId)) break;
      seen.add(curId);
      const row: { id: string; name: string; parentFolderId: string | null } | null =
        await prisma.qcfDocumentFolder.findFirst({
        where: { id: curId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true, name: true, parentFolderId: true },
      });
      if (!row) break;
      folderCrumbs.unshift({
        id: row.id,
        name: row.name,
        navKey: encodeLocation({ kind: "folder", folderId: row.id }),
      });
      curId = row.parentFolderId;
    }
    return [...crumbs, ...folderCrumbs];
  }

  return crumbs;
}

/** Global module panel: tenant-global folders + every QcfDocument (all modules). */
async function listGlobalAllDocumentsView(
  user: SessionUser,
  breadcrumbs: BreadcrumbItem[],
  opts: { q?: string; page?: number; pageSize?: number },
): Promise<GlobalExplorerContentsResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const folderWhere = {
    tenantId: user.tenantId,
    refType: null,
    refId: null,
    parentFolderId: null,
    deletedAt: null,
  };

  const fileWhere: {
    tenantId: string;
    deletedAt: null;
    fileName?: { contains: string; mode: "insensitive" };
  } = {
    tenantId: user.tenantId,
    deletedAt: null,
  };
  if (opts.q?.trim()) {
    fileWhere.fileName = { contains: opts.q.trim(), mode: "insensitive" };
  }

  const [folderRows, fileRows, totalFolders, totalFiles] = await Promise.all([
    prisma.qcfDocumentFolder.findMany({
      where: folderWhere,
      orderBy: { name: "asc" },
    }),
    prisma.qcfDocument.findMany({
      where: fileWhere,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.qcfDocumentFolder.count({ where: folderWhere }),
    prisma.qcfDocument.count({ where: fileWhere }),
  ]);

  const names = await resolveUploaderNames(
    user.tenantId,
    fileRows.map((r) => r.uploadedBy),
  );
  let files = fileRows.map((r) => toDocumentDto(r, names.get(r.uploadedBy) ?? null));
  files = await enrichRelatedLabels(user.tenantId, files);

  return {
    folder: null,
    breadcrumbs,
    folders: folderRows.map((r) => toFolderDto(r)),
    files,
    modules: [],
    entities: [],
    totalFolders,
    totalFiles,
    totalEntities: 0,
    page,
    pageSize,
  };
}

export async function listGlobalExplorerContents(
  user: SessionUser,
  locationRaw: string | null | undefined,
  opts?: { q?: string; page?: number; pageSize?: number },
): Promise<GlobalExplorerContentsResult> {
  const location = decodeLocation(locationRaw);
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts?.pageSize ?? 25));
  const breadcrumbs = await buildGlobalExplorerBreadcrumbs(user, location);

  if (location.kind === "root") {
    const visibleModules = await listVisibleExplorerModules(user);
    const modules: ExplorerModuleDto[] = visibleModules.map((module) => ({
      module,
      label: getModuleLabel(module),
      navKey: encodeLocation({ kind: "module", module }),
    }));
    return {
      folder: null,
      breadcrumbs,
      folders: [],
      files: [],
      modules,
      entities: [],
      totalFolders: 0,
      totalFiles: 0,
      totalEntities: 0,
      page,
      pageSize,
    };
  }

  if (location.kind === "module") {
    if (location.module === "global") {
      return listGlobalAllDocumentsView(user, breadcrumbs, { q: opts?.q, page, pageSize });
    }

    const refType = location.module as DocumentRefType;
    const allIds = await listEntityIdsForModule(user, refType);
    let filtered = allIds;
    if (opts?.q?.trim()) {
      const labels = await resolveEntityLabels(user, refType, allIds);
      const q = opts.q.trim().toLowerCase();
      filtered = allIds.filter((id) => {
        const label = labels.get(id)?.label ?? id;
        return label.toLowerCase().includes(q);
      });
    }
    const totalEntities = filtered.length;
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
    const labels = await resolveEntityLabels(user, refType, slice);
    const entities: ExplorerEntityDto[] = slice.map((refId) => {
      const meta = labels.get(refId);
      return {
        refType,
        refId,
        label: meta?.label ?? refId.slice(0, 8),
        href: meta?.href ?? REF_CONFIG[refType].parentPath(refId),
        navKey: encodeLocation({ kind: "entity", refType, refId }),
      };
    });

    return {
      folder: null,
      breadcrumbs,
      folders: [],
      files: [],
      modules: [],
      entities,
      totalFolders: 0,
      totalFiles: 0,
      totalEntities,
      page,
      pageSize,
    };
  }

  if (location.kind === "entity") {
    const scope = { refType: location.refType, refId: location.refId };
    const base = await listFolderContents(user, {
      folderId: null,
      scope,
      q: opts?.q,
      page,
      pageSize,
    });
    return {
      ...base,
      breadcrumbs,
      modules: [],
      entities: [],
      totalEntities: 0,
    };
  }

  if (location.kind === "folder") {
    const folder = await prisma.qcfDocumentFolder.findFirst({
      where: { id: location.folderId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!folder) throw new FolderServiceError("Folder not found", 404);

    const scope =
      folder.refType && folder.refId
        ? { refType: folder.refType as DocumentRefType, refId: folder.refId }
        : { refType: null, refId: null };

    const base = await listFolderContents(user, {
      folderId: location.folderId,
      scope,
      q: opts?.q,
      page,
      pageSize,
    });
    return {
      ...base,
      breadcrumbs,
      modules: [],
      entities: [],
      totalEntities: 0,
    };
  }

  return {
    folder: null,
    breadcrumbs,
    folders: [],
    files: [],
    modules: [],
    entities: [],
    totalFolders: 0,
    totalFiles: 0,
    totalEntities: 0,
    page,
    pageSize,
  };
}
