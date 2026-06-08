"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

/**
 * TanStack Query layer for the Docs tab. This is the single source of truth for
 * docs + folders: lists are cached (so revisiting the tab doesn't refetch), and
 * create / rename / delete / move all write the cache OPTIMISTICALLY and then
 * persist — no `invalidateQueries`, so there are no redundant API calls. The
 * only network traffic is the mutating request itself + lazy page loads on
 * scroll.
 */

export const ROOT = "root";
const PAGE_SIZE = 15;

export interface DocSummary {
  id: string;
  title: string;
  templateKey: string | null;
  folderId: string | null;
  createdBy: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerAvatar: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FolderSummary {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  docCount: number;
}

interface DocPage {
  data: DocSummary[];
  hasMore: boolean;
}
type DocsInfinite = InfiniteData<DocPage, number>;

// ── Query keys ──────────────────────────────────────────────────────────
const foldersKey = (p: string) => ["qt-docs", "folders", p] as const;
const listKey = (p: string, scope: string) => ["qt-docs", "list", p, scope] as const;
const listPrefix = (p: string) => ["qt-docs", "list", p] as const;

const byName = (a: FolderSummary, b: FolderSummary) => a.name.localeCompare(b.name);

// ── Cache updaters ──────────────────────────────────────────────────────
function flatten(data: DocsInfinite | undefined): DocSummary[] {
  return data ? data.pages.flatMap((p) => p.data) : [];
}

function prependDocs(docs: DocSummary[]) {
  return (old: DocsInfinite | undefined): DocsInfinite => {
    if (!old || old.pages.length === 0) {
      return { pages: [{ data: docs, hasMore: false }], pageParams: [0] };
    }
    const ids = new Set(docs.map((d) => d.id));
    const pages = old.pages.map((p, i) =>
      i === 0
        ? { ...p, data: [...docs, ...p.data.filter((d) => !ids.has(d.id))] }
        : { ...p, data: p.data.filter((d) => !ids.has(d.id)) },
    );
    return { ...old, pages };
  };
}

function removeDoc(docId: string) {
  return (old: DocsInfinite | undefined): DocsInfinite | undefined =>
    old
      ? { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.filter((d) => d.id !== docId) })) }
      : old;
}

function bumpCount(folderId: string, delta: number) {
  return (old: FolderSummary[] | undefined): FolderSummary[] =>
    (old ?? []).map((f) =>
      f.id === folderId ? { ...f, docCount: Math.max(0, f.docCount + delta) } : f,
    );
}

// ── Queries ─────────────────────────────────────────────────────────────
export function useDocFolders(projectId: string) {
  return useQuery({
    queryKey: foldersKey(projectId),
    queryFn: async (): Promise<FolderSummary[]> => {
      const j = await fetch(`/api/projects/${projectId}/docs/folders`).then((r) => r.json());
      return j?.success ? (j.data ?? []) : [];
    },
  });
}

export function useDocList(projectId: string, scope: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: listKey(projectId, scope),
    queryFn: async ({ pageParam }): Promise<DocPage> => {
      const j = await fetch(
        `/api/projects/${projectId}/docs?folder=${encodeURIComponent(scope)}&offset=${pageParam}&limit=${PAGE_SIZE}`,
      ).then((r) => r.json());
      return { data: (j?.data ?? []) as DocSummary[], hasMore: !!j?.hasMore };
    },
    initialPageParam: 0,
    // Track the server offset by request size (not by cached doc counts) so
    // optimistic inserts/removals into the cache can't skew the next offset.
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + PAGE_SIZE : undefined,
    enabled,
  });
}

// ── Mutations (optimistic; no refetch) ──────────────────────────────────
export function useCreateFolder(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<FolderSummary> => {
      const j = await fetch(`/api/projects/${projectId}/docs/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json());
      if (!j?.success) throw new Error(j?.error ?? "Couldn't create folder.");
      return j.data as FolderSummary;
    },
    onSuccess: (folder) => {
      qc.setQueryData<FolderSummary[]>(foldersKey(projectId), (prev = []) =>
        [...prev, folder].sort(byName),
      );
    },
  });
}

export function useRenameFolder(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      const j = await fetch(`/api/docs/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json());
      if (!j?.success) throw new Error(j?.error ?? "Couldn't rename folder.");
      return j.data;
    },
    onMutate: async ({ folderId, name }) => {
      await qc.cancelQueries({ queryKey: foldersKey(projectId) });
      const prev = qc.getQueryData<FolderSummary[]>(foldersKey(projectId));
      qc.setQueryData<FolderSummary[]>(foldersKey(projectId), (old = []) =>
        old.map((f) => (f.id === folderId ? { ...f, name } : f)).sort(byName),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(foldersKey(projectId), ctx.prev);
    },
  });
}

export function useDeleteFolder(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (folder: FolderSummary) => {
      const j = await fetch(`/api/docs/folders/${folder.id}`, { method: "DELETE" }).then((r) =>
        r.json(),
      );
      if (!j?.success) throw new Error(j?.error ?? "Couldn't delete folder.");
      return j.data;
    },
    onMutate: async (folder) => {
      await qc.cancelQueries({ queryKey: foldersKey(projectId) });
      await qc.cancelQueries({ queryKey: listKey(projectId, ROOT) });
      const prevFolders = qc.getQueryData<FolderSummary[]>(foldersKey(projectId));
      const prevRoot = qc.getQueryData<DocsInfinite>(listKey(projectId, ROOT));

      // Drop the folder, and float its already-loaded docs back into the root
      // list so they reappear immediately under "All pages".
      qc.setQueryData<FolderSummary[]>(foldersKey(projectId), (old = []) =>
        old.filter((f) => f.id !== folder.id),
      );
      const orphans = flatten(qc.getQueryData<DocsInfinite>(listKey(projectId, folder.id))).map(
        (d) => ({ ...d, folderId: null }),
      );
      if (orphans.length) {
        qc.setQueryData<DocsInfinite>(listKey(projectId, ROOT), prependDocs(orphans));
      }
      qc.removeQueries({ queryKey: listKey(projectId, folder.id) });
      return { prevFolders, prevRoot };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevFolders) qc.setQueryData(foldersKey(projectId), ctx.prevFolders);
      if (ctx?.prevRoot) qc.setQueryData(listKey(projectId, ROOT), ctx.prevRoot);
    },
  });
}

export function useMoveDoc(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, toScope }: { docId: string; toScope: string }) => {
      const folderId = toScope === ROOT ? null : toScope;
      const j = await fetch(`/api/docs/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      }).then((r) => r.json());
      if (!j?.success) throw new Error(j?.error ?? "Couldn't move page.");
      return j.data;
    },
    onMutate: async ({ docId, toScope }) => {
      await qc.cancelQueries({ queryKey: listPrefix(projectId) });
      await qc.cancelQueries({ queryKey: foldersKey(projectId) });

      // Locate the doc + its current scope across all cached lists.
      const lists = qc.getQueriesData<DocsInfinite>({ queryKey: listPrefix(projectId) });
      let fromScope: string | undefined;
      let doc: DocSummary | undefined;
      for (const [key, data] of lists) {
        const found = flatten(data).find((d) => d.id === docId);
        if (found) {
          fromScope = key[3] as string;
          doc = found;
          break;
        }
      }
      if (!doc || !fromScope || fromScope === toScope) return { skipped: true as const };

      const targetFolderId = toScope === ROOT ? null : toScope;
      const targetCached = qc.getQueryData(listKey(projectId, toScope)) !== undefined;
      const snapFrom = qc.getQueryData<DocsInfinite>(listKey(projectId, fromScope));
      const snapTo = qc.getQueryData<DocsInfinite>(listKey(projectId, toScope));
      const snapFolders = qc.getQueryData<FolderSummary[]>(foldersKey(projectId));

      qc.setQueryData<DocsInfinite>(listKey(projectId, fromScope), removeDoc(docId));
      // Only seed the target list if it's already loaded; otherwise leave it
      // unfetched so opening the folder later loads the full, correct page.
      if (targetCached) {
        qc.setQueryData<DocsInfinite>(
          listKey(projectId, toScope),
          prependDocs([{ ...doc, folderId: targetFolderId }]),
        );
      }
      if (fromScope !== ROOT) qc.setQueryData(foldersKey(projectId), bumpCount(fromScope, -1));
      if (toScope !== ROOT) qc.setQueryData(foldersKey(projectId), bumpCount(toScope, 1));

      return { skipped: false as const, fromScope, toScope, targetCached, snapFrom, snapTo, snapFolders };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx || ctx.skipped) return;
      qc.setQueryData(listKey(projectId, ctx.fromScope), ctx.snapFrom);
      if (ctx.targetCached) qc.setQueryData(listKey(projectId, ctx.toScope), ctx.snapTo);
      qc.setQueryData(foldersKey(projectId), ctx.snapFolders);
    },
  });
}

export function useCreateDoc(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      templateKey,
      folderId,
    }: {
      templateKey: string;
      folderId?: string | null;
    }): Promise<DocSummary> => {
      const j = await fetch(`/api/projects/${projectId}/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey, folderId: folderId ?? null }),
      }).then((r) => r.json());
      if (!j?.success) throw new Error(j?.error ?? "Couldn't create page.");
      return j.data as DocSummary;
    },
    onSuccess: (doc, { folderId }) => {
      const scope = folderId ?? ROOT;
      // Seed the cache so the new page is already there when the user returns
      // from the editor (within staleTime) — no refetch needed.
      if (qc.getQueryData(listKey(projectId, scope)) !== undefined) {
        qc.setQueryData<DocsInfinite>(listKey(projectId, scope), prependDocs([doc]));
      }
      if (folderId) qc.setQueryData(foldersKey(projectId), bumpCount(folderId, 1));
    },
  });
}
