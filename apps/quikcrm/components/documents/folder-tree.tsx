"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { fetchTreeChildren } from "@/lib/documents/folder-client";
import type { FolderTreeNodeDto, FolderScope } from "@/lib/services/document-folders/types";

interface Props {
  scope: FolderScope;
  activeFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  refreshKey: number;
}

type LoadedNode = FolderTreeNodeDto;

export function FolderTree({ scope, activeFolderId, onSelect, refreshKey }: Props) {
  const [roots, setRoots] = useState<LoadedNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = useState<Record<string, FolderTreeNodeDto[]>>({});
  const [loading, setLoading] = useState(true);

  const loadRoots = useCallback(async () => {
    setLoading(true);
    try {
      const folders = await fetchTreeChildren(scope, null);
      setRoots(folders);
      setChildrenMap({});
      setExpanded(new Set());
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void loadRoots();
  }, [loadRoots, refreshKey]);

  async function toggleExpand(folderId: string) {
    const next = new Set(expanded);
    if (next.has(folderId)) {
      next.delete(folderId);
      setExpanded(next);
      return;
    }
    if (!childrenMap[folderId]) {
      const kids = await fetchTreeChildren(scope, folderId);
      setChildrenMap((m) => ({ ...m, [folderId]: kids }));
    }
    next.add(folderId);
    setExpanded(next);
  }

  function renderNode(node: LoadedNode, depth: number) {
    const isExpanded = expanded.has(node.id);
    const kids = childrenMap[node.id] ?? [];
    const hasChildren = node.hasChildren || kids.length > 0;
    const active = activeFolderId === node.id;

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
              <ChevronRight size={14} className={isExpanded ? "rotate-90 transition" : "transition"} />
            </button>
          ) : (
            <span className="w-[18px]" />
          )}
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 truncate text-left"
            onClick={() => onSelect(node.id)}
          >
            {isExpanded ? (
              <FolderOpen size={16} className="shrink-0 text-accent-600" />
            ) : (
              <Folder size={16} className="shrink-0 text-accent-600" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
        </div>
        {isExpanded &&
          kids.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  if (loading) {
    return <p className="px-2 py-4 text-xs text-crm-muted">Loading folders…</p>;
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        className={
          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm " +
          (activeFolderId === null
            ? "bg-accent-100 font-medium text-accent-800"
            : "hover:bg-[var(--color-bg-secondary)]")
        }
        onClick={() => onSelect(null)}
      >
        <Folder size={16} className="text-accent-600" />
        Uncategorized
      </button>
      {roots.length === 0 ? (
        <p className="px-2 py-2 text-xs text-crm-muted">No folders yet</p>
      ) : (
        roots.map((node) => renderNode(node, 0))
      )}
    </div>
  );
}
