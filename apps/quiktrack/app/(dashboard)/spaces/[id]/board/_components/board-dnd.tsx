"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";

/**
 * @dnd-kit wrappers for the kanban board's CARD → COLUMN drag. Mirrors the
 * StatusChip / DropZone split in
 * `settings/board/_components/status-chip.tsx` — the only sanctioned @dnd-kit
 * pattern in this app. Cards are draggables (id = issue id, carrying their
 * current statusId in `data`); each column body is a droppable keyed by the
 * column's primary statusId. Column-header reorder stays on native HTML5 drag
 * (a separate interaction on the header) and is untouched here.
 */

/** Data carried on the drag so `onDragEnd` knows the card's source status,
 *  and the DragOverlay can render a preview of the card being moved. */
export interface CardDragData {
  statusId: string;
  key: string;
  title: string;
}

/** Data carried on each droppable column so `onDragEnd` can tell whether the
 *  card was dropped back onto the column it already lives in (same-column
 *  no-op) vs a real move. `statusIds` is the FULL set the column shows;
 *  `primaryStatusId` is where a dropped card is moved to. */
export interface ColumnDropData {
  statusIds: string[];
  primaryStatusId: string;
}

/**
 * Wraps a board card as a @dnd-kit draggable. Listeners/attributes go on the
 * root; interactive children (⋯ menu, subtask disclosure, checkbox) must call
 * `stopPropagation` on their own pointer-down so the PointerSensor doesn't
 * swallow their clicks. The PointerSensor has a 4px activation distance, so a
 * plain click (no movement) still fires the card's own onClick (opens the card).
 */
export function DraggableCard({
  id,
  statusId,
  issueKey,
  title,
  children,
}: {
  id: string;
  statusId: string;
  issueKey: string;
  title: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { statusId, key: issueKey, title } satisfies CardDragData,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? "opacity-40" : ""}
    >
      {children}
    </div>
  );
}

/**
 * Wraps a column's card body as a @dnd-kit droppable. `id` is the column's
 * primary statusId (the move target). Highlights with a ring while a card
 * hovers over it, matching the reference DropZone. Columns with no mapped
 * status (no drop target) render children with no droppable at all.
 */
export function DroppableColumnBody({
  id,
  statusIds,
  className = "",
  children,
}: {
  /** Primary statusId of the column, or null when the column has no target. */
  id: string | null;
  /** Every status this column shows (for the same-column no-op check). */
  statusIds?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  if (!id) return <NonDroppableBody className={className}>{children}</NonDroppableBody>;
  return (
    <DroppableBody id={id} statusIds={statusIds ?? [id]} className={className}>
      {children}
    </DroppableBody>
  );
}

function DroppableBody({
  id,
  statusIds,
  className,
  children,
}: {
  id: string;
  statusIds: string[];
  className: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { statusIds, primaryStatusId: id } satisfies ColumnDropData,
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "rounded ring-2 ring-accent-300" : ""}`}
    >
      {children}
    </div>
  );
}

function NonDroppableBody({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return <div className={className}>{children}</div>;
}
