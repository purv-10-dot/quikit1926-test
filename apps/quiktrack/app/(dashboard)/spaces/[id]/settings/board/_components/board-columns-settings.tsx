"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Loader2, Plus, Trash2, ArrowLeft, ArrowRight, Info } from "lucide-react";
import { StatusChip, DropZone } from "./status-chip";
import {
  UNMAPPED,
  type BoardColumn,
  type BoardColumnsResponse,
  type BoardStatus,
} from "./board-columns-types";

let idc = 0;
const cid = () => `col_${++idc}`;

async function fetchMapping(projectId: string): Promise<BoardColumnsResponse> {
  const r = await fetch(`/api/projects/${projectId}/board-columns`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as BoardColumnsResponse;
}

export function BoardColumnsSettings({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["quiktrack", "board-columns", projectId],
    queryFn: () => fetchMapping(projectId),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 px-8 py-8 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading board settings…
      </div>
    );
  }
  if (q.error) return <div className="px-8 py-8 text-sm text-red-600">{(q.error as Error).message}</div>;

  return <Editor projectId={projectId} data={q.data!} onSaved={() => qc.invalidateQueries({ queryKey: ["quiktrack", "board-columns", projectId] })} />;
}

function Editor({
  projectId,
  data,
  onSaved,
}: {
  projectId: string;
  data: BoardColumnsResponse;
  onSaved: () => void;
}) {
  const statusById = useMemo(
    () => new Map(data.statuses.map((s) => [s.id, s])),
    [data.statuses],
  );

  // Seed columns: use configured columns, else one column per status (today's default).
  const [columns, setColumns] = useState<BoardColumn[]>(() =>
    data.configured
      ? data.columns.map((c) => ({ id: cid(), name: c.name, statusIds: [...c.statusIds] }))
      : data.statuses.map((s) => ({ id: cid(), name: s.name, statusIds: [s.id] })),
  );
  const [unmapped, setUnmapped] = useState<string[]>(() =>
    data.configured ? [...data.unmappedStatusIds] : [],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const removeStatusEverywhere = (statusId: string) => {
    setColumns((cols) => cols.map((c) => ({ ...c, statusIds: c.statusIds.filter((id) => id !== statusId) })));
    setUnmapped((u) => u.filter((id) => id !== statusId));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const statusId = String(e.active.id);
    const dest = e.over ? String(e.over.id) : null;
    if (!dest) return;
    removeStatusEverywhere(statusId);
    if (dest === UNMAPPED) {
      setUnmapped((u) => [...u, statusId]);
    } else {
      setColumns((cols) => cols.map((c) => (c.id === dest ? { ...c, statusIds: [...c.statusIds, statusId] } : c)));
    }
  };

  const addColumn = () => setColumns((cols) => [...cols, { id: cid(), name: "New column", statusIds: [] }]);
  const renameColumn = (id: string, name: string) =>
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, name } : c)));
  const deleteColumn = (id: string) =>
    setColumns((cols) => {
      const gone = cols.find((c) => c.id === id);
      if (gone) setUnmapped((u) => [...u, ...gone.statusIds]); // its statuses become unmapped
      return cols.filter((c) => c.id !== id);
    });
  const moveColumn = (id: string, dir: -1 | 1) =>
    setColumns((cols) => {
      const i = cols.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cols.length) return cols;
      const next = [...cols];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/board-columns`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: columns.map((c) => ({ name: c.name.trim() || "Column", statusIds: c.statusIds })) }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Save failed");
    },
    onSuccess: onSaved,
  });

  const chip = (statusId: string) => {
    const s = statusById.get(statusId) as BoardStatus | undefined;
    if (!s) return null;
    const count = data.countByStatus[statusId] ?? 0;
    return <StatusChip key={statusId} status={s} count={count} warn={false} />;
  };

  return (
    <div className="px-8 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Board settings</h1>
      <p className="mb-1 mt-1 text-sm text-gray-500">Columns and statuses</p>
      <p className="mb-6 max-w-3xl text-sm text-gray-500">
        Use columns and statuses to define how work progresses on your board. Drag a status into a
        column to show it there; drag it to <span className="font-medium">Unmapped</span> to hide it
        from the board and backlog.
      </p>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={addColumn}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <Plus className="h-4 w-4" /> Add column
        </button>
        <div className="ml-auto flex items-center gap-2">
          {save.error && <span className="text-sm text-red-600">{(save.error as Error).message}</span>}
          {save.isSuccess && <span className="text-sm text-green-600">Saved.</span>}
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save columns"}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {/* Unmapped bucket */}
          <DropZone id={UNMAPPED} className="w-56 shrink-0 rounded-md border border-dashed border-gray-300 bg-gray-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Unmapped statuses</div>
            <p className="mb-3 flex items-start gap-1 text-[11px] text-gray-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" /> Work items with these statuses won&apos;t be visible.
            </p>
            <div className="space-y-2">{unmapped.map(chip)}</div>
          </DropZone>

          {/* Columns */}
          {columns.map((col, i) => (
            <div key={col.id} className="w-56 shrink-0 rounded-md border border-gray-200 bg-white">
              <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-2">
                <input
                  value={col.name}
                  onChange={(e) => renameColumn(col.id, e.target.value)}
                  className="min-w-0 flex-1 rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50 focus:bg-gray-50"
                />
                <button type="button" onClick={() => moveColumn(col.id, -1)} disabled={i === 0} className="rounded p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30" title="Move left">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => moveColumn(col.id, 1)} disabled={i === columns.length - 1} className="rounded p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30" title="Move right">
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => deleteColumn(col.id)} className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600" title="Delete column">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <DropZone id={col.id} className="min-h-[120px] space-y-2 p-2.5">
                {col.statusIds.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-gray-300">Drop a status here</p>
                )}
                {col.statusIds.map(chip)}
              </DropZone>
            </div>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
