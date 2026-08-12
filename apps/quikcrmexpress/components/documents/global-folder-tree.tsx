"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Package,
  UserPlus,
  Globe,
} from "lucide-react";
import { fetchGlobalTreeChildren } from "@/lib/documents/folder-client";
import type { ExplorerModuleKey } from "@/lib/services/document-folders/explorer-location";
import type { ExplorerLocation } from "@/lib/services/document-folders/explorer-location";
import type { ExplorerTreeNodeDto } from "@/lib/services/document-folders/types";

const MODULE_ICONS: Record<ExplorerModuleKey, typeof Folder> = {
  lead: UserPlus,
  account: Building2,
  opportunity: Briefcase,
  quote: FileText,
  order: Package,
  global: Globe,
};

interface Props {
  location: ExplorerLocation;
  onNavigate: (loc: ExplorerLocation) => void;
  refreshKey: number;
}

function isLocationActive(loc: ExplorerLocation, node: ExplorerTreeNodeDto): boolean {
  if (node.nodeKind === "module" && loc.kind === "module") {
    return loc.module === node.moduleKey;
  }
  if (node.nodeKind === "entity" && loc.kind === "entity") {
    return loc.refType === node.refType && loc.refId === node.refId;
  }
  if (node.nodeKind === "folder" && loc.kind === "folder") {
    return loc.folderId === node.id;
  }
  return false;
}

export function GlobalFolderTree({ location, onNavigate, refreshKey }: Props) {
  const [roots, setRoots] = useState<ExplorerTreeNodeDto[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = useState<Record<string, ExplorerTreeNodeDto[]>>({});
  const [loading, setLoading] = useState(true);

  const loadRoots = useCallback(async () => {
    setLoading(true);
    try {
      const nodes = await fetchGlobalTreeChildren(null);
      setRoots(nodes);
      setChildrenMap({});
      setExpanded(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoots();
  }, [loadRoots, refreshKey]);

  async function toggleExpand(nodeId: string) {
    const next = new Set(expanded);
    if (next.has(nodeId)) {
      next.delete(nodeId);
      setExpanded(next);
      return;
    }
    if (!childrenMap[nodeId]) {
      const kids = await fetchGlobalTreeChildren(nodeId);
      setChildrenMap((m) => ({ ...m, [nodeId]: kids }));
    }
    next.add(nodeId);
    setExpanded(next);
  }

  function navigateNode(node: ExplorerTreeNodeDto) {
    if (node.nodeKind === "module" && node.moduleKey) {
      onNavigate({ kind: "module", module: node.moduleKey });
      return;
    }
    if (node.nodeKind === "entity" && node.refType && node.refId) {
      onNavigate({ kind: "entity", refType: node.refType, refId: node.refId });
      return;
    }
    if (node.nodeKind === "folder") {
      onNavigate({ kind: "folder", folderId: node.id });
    }
  }

  function renderNode(node: ExplorerTreeNodeDto, depth: number) {
    const isExpanded = expanded.has(node.id);
    const kids = childrenMap[node.id] ?? [];
    const hasChildren = node.hasChildren || kids.length > 0;
    const active = isLocationActive(location, node);
    const Icon =
      node.nodeKind === "module" && node.moduleKey
        ? MODULE_ICONS[node.moduleKey]
        : isExpanded
          ? FolderOpen
          : Folder;

    return (
      <div key={node.id}>
        <div
          className={
            "flex items-center gap-1 rounded py-1.5 pr-2 text-sm " +
            (active ? "bg-accent-100 text-accent-800" : "hover:bg-[var(--color-bg-secondary)]")
          }
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-crm-muted"
              onClick={() => void toggleExpand(node.id)}
            >
              <ChevronRight
                size={14}
                className={isExpanded ? "rotate-90 transition" : "transition"}
              />
            </button>
          ) : (
            <span className="w-[18px]" />
          )}
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 truncate text-left"
            onClick={() => navigateNode(node)}
          >
            <Icon size={16} className="shrink-0 text-accent-600" />
            <span className="truncate">{node.name}</span>
          </button>
          {node.relatedHref && node.nodeKind === "entity" && (
            <Link
              href={node.relatedHref}
              className="shrink-0 text-[10px] text-crm-blue hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open
            </Link>
          )}
        </div>
        {isExpanded && kids.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  if (loading) {
    return <p className="px-2 py-4 text-xs text-crm-muted">Loading folders…</p>;
  }

  const rootActive = location.kind === "root";

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        className={
          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm " +
          (rootActive
            ? "bg-accent-100 font-medium text-accent-800"
            : "hover:bg-[var(--color-bg-secondary)]")
        }
        onClick={() => onNavigate({ kind: "root" })}
      >
        <Folder size={16} className="text-accent-600" />
        Documents
      </button>
      {roots.map((node) => renderNode(node, 0))}
    </div>
  );
}

export function treeParentIdFromLocation(loc: ExplorerLocation): string | null {
  switch (loc.kind) {
    case "root":
      return null;
    case "module":
      return `v:module:${loc.module}`;
    case "entity":
      return `v:entity:${loc.refType}:${loc.refId}`;
    case "folder":
      return loc.folderId;
  }
}
