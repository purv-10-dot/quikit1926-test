"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, Star } from "lucide-react";
import { useConfirm } from "@quikit/ui";
import type { LeadSavedView } from "@/types/lead-filter";

export function SavedViewsBar({
  views,
  counts,
  totalCount,
  activeId,
  onPick,
  onDelete,
  onNewView,
}: {
  views: LeadSavedView[];
  counts: Record<string, number>;
  totalCount: number;
  activeId: string | null;
  onPick: (view: LeadSavedView | null) => void;
  onDelete: (id: string) => void;
  onNewView: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  function scroll(dir: "left" | "right") {
    if (!scroller.current) return;
    scroller.current.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
  }

  return (
    <div className="mb-2 flex items-center gap-1.5 border-b border-crm-border pb-1.5 lg:gap-2 lg:pb-2">
      <button
        onClick={() => scroll("left")}
        className="rounded-lg p-1 text-crm-muted hover:bg-crm-panel lg:p-1.5"
        aria-label="Scroll left"
      >
        <ChevronLeft size={16} />
      </button>

      <div ref={scroller} className="crm-hscroll flex flex-1 items-center gap-1.5 overflow-x-auto scroll-smooth lg:gap-2">
        <ViewPill
          label="All leads"
          count={totalCount}
          active={activeId === null}
          onClick={() => onPick(null)}
        />
        {views.map((v) => (
          <SavedViewPill
            key={v.id}
            view={v}
            count={counts[v.id]}
            active={v.id === activeId}
            onPick={() => onPick(v)}
            onDelete={async () => {
              const ok = await confirm({
                title: "Delete saved view?",
                description: `"${v.name}" will be removed. The leads themselves are not affected.`,
                confirmLabel: "Delete",
                cancelLabel: "Cancel",
                tone: "danger",
              });
              if (ok) onDelete(v.id);
            }}
          />
        ))}
        <button
          onClick={onNewView}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-crm-border bg-white px-2.5 py-1 text-xs text-crm-blue hover:bg-crm-blue-soft lg:px-3 lg:py-1.5 lg:text-sm"
        >
          <Plus size={14} /> New view
        </button>
      </div>

      <button
        onClick={() => scroll("right")}
        className="rounded-lg p-1 text-crm-muted hover:bg-crm-panel lg:p-1.5"
        aria-label="Scroll right"
      >
        <ChevronRight size={16} />
      </button>
      <button className="rounded-lg p-1 text-crm-muted hover:bg-crm-panel lg:p-1.5" aria-label="More">
        <ChevronDown size={16} />
      </button>
    </div>
  );
}

function ViewPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 pb-1.5 pt-0.5 text-sm transition lg:gap-2 lg:px-3 lg:pb-2 lg:pt-1 " +
        (active
          ? "border-crm-blue text-crm-blue font-semibold"
          : "border-transparent text-crm-text hover:text-crm-blue")
      }
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span className="rounded-full bg-crm-panel px-1.5 py-0.5 text-[11px] text-crm-muted">{count}</span>
      )}
    </button>
  );
}

function SavedViewPill({
  view,
  count,
  active,
  onPick,
  onDelete,
}: {
  view: LeadSavedView;
  count?: number;
  active: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group inline-flex shrink-0 items-center">
      <button
        onClick={onPick}
        className={
          "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 pb-1.5 pt-0.5 text-sm transition lg:px-3 lg:pb-2 lg:pt-1 " +
          (active
            ? "border-crm-blue text-crm-blue font-semibold"
            : "border-transparent text-crm-text hover:text-crm-blue")
        }
      >
        {view.isDefault && <Star size={12} className="fill-amber-400 text-amber-400" />}
        <span className="max-w-[140px] truncate lg:max-w-none">{view.name}</span>
        {typeof count === "number" && (
          <span className="rounded-full bg-crm-panel px-1.5 py-0.5 text-[11px] text-crm-muted">{count}</span>
        )}
      </button>
      <button
        onClick={onDelete}
        className="ml-0.5 rounded p-1 text-crm-muted opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
        aria-label="Delete view"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}
