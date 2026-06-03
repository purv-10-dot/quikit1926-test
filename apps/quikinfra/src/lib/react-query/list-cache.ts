import type { QueryClient } from "@tanstack/react-query";

type ListPayload = { data: unknown[]; total?: number };

function rowId(row: unknown): string | undefined {
  if (row && typeof row === "object" && "id" in row) {
    return String((row as { id: unknown }).id);
  }
  return undefined;
}

/**
 * After a list mutation, patch any in-memory list caches and refetch active
 * queries so the UI matches the server on the first save (not only after a
 * second edit). Awaits invalidation so drawers can close after data is fresh.
 */
export async function refreshListQueries(
  qc: QueryClient,
  queryKey: string,
  opts?: { updatedRow?: unknown; id?: string; removedId?: string },
): Promise<void> {
  const { updatedRow, id, removedId } = opts ?? {};

  if (removedId) {
    qc.setQueriesData<ListPayload>(
      { queryKey: [queryKey] },
      (old) => {
        if (!old?.data) return old;
        const data = old.data.filter((r) => rowId(r) !== removedId);
        const removed = old.data.length - data.length;
        return {
          ...old,
          data,
          total: old.total !== undefined ? Math.max(0, old.total - removed) : old.total,
        };
      },
    );
  } else if (updatedRow && id) {
    qc.setQueriesData<ListPayload>(
      { queryKey: [queryKey] },
      (old) => {
        if (!old?.data) return old;
        const idx = old.data.findIndex((r) => rowId(r) === id);
        if (idx < 0) return old;
        const data = [...old.data];
        data[idx] = { ...(data[idx] as object), ...(updatedRow as object) };
        return { ...old, data };
      },
    );
  }

  await qc.invalidateQueries({ queryKey: [queryKey], refetchType: "active" });
}
