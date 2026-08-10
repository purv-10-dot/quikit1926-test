"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KanbanSkeleton } from "@/components/ui/skeleton";
import { CloseDealModal } from "./close-deal-modal";
import { buildOpportunityFilterRequest } from "./opportunity-advanced-filter";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/services/opportunities/stage-labels";
import { formatINR } from "@/lib/services/opportunities/currency";
import type { FilterPayload } from "@/types/lead-filter";
import type { CrmOpportunityStage } from "@quikit/database";

// ─── Types ────────────────────────────────────────────────────────────────

type DealCard = {
  id: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  amount: number | null;
  currency: string;
  amountDisplay: string;
  probability: number;
  weightedAmount: number | null;
  closeDate: string | null;
  ownerId: string | null;
  ownerName: string | null;
  lastStageChangeAt: string | null;
  isStale: boolean;
};

type ColumnDto = {
  stage: CrmOpportunityStage;
  label: string;
  count: number;
  totalAmountInr: number;
  totalWeightedInr: number;
  totalsByCurrency: Array<{ currency: string; amount: number; display: string }>;
  deals: DealCard[];
};

type BoardDto = {
  columns: ColumnDto[];
  totalsByCurrency: Array<{ currency: string; amount: number; display: string }>;
  totalPipelineInr: number;
  totalWeightedInr: number;
  thisQuarterForecastInr: number;
  atRisk: { stuckDeals: number; noActivity7d: number; closingThisMonth: number };
};

const PIPELINE_QUERY_KEY = ["opportunities", "pipeline"] as const;

// Per-stage palette mirrors the leads kanban styling. Closed states swap to
// emerald/rose so Won/Lost reads semantically rather than blending in.
const STAGE_PALETTE: Record<
  CrmOpportunityStage,
  { dot: string; header: string; count: string; ring: string }
> = {
  Prospecting: {
    dot: "bg-slate-400",
    header: "bg-slate-50",
    count: "bg-slate-200 text-slate-700",
    ring: "ring-slate-300",
  },
  Qualification: {
    dot: "bg-blue-400",
    header: "bg-blue-50",
    count: "bg-blue-200 text-blue-800",
    ring: "ring-blue-300",
  },
  Proposal: {
    dot: "bg-violet-400",
    header: "bg-violet-50",
    count: "bg-violet-200 text-violet-800",
    ring: "ring-violet-300",
  },
  Negotiation: {
    dot: "bg-amber-400",
    header: "bg-amber-50",
    count: "bg-amber-200 text-amber-800",
    ring: "ring-amber-300",
  },
  ClosedWon: {
    dot: "bg-emerald-400",
    header: "bg-emerald-50",
    count: "bg-emerald-200 text-emerald-800",
    ring: "ring-emerald-300",
  },
  ClosedLost: {
    dot: "bg-rose-400",
    header: "bg-rose-50",
    count: "bg-rose-200 text-rose-700",
    ring: "ring-rose-300",
  },
};

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase() || "?";
}

// ─── Data fetcher ─────────────────────────────────────────────────────────

async function fetchPipeline(filter: FilterPayload, search: string): Promise<BoardDto> {
  const hasFilter = filter.conditions.length > 0 || search.length > 0;
  const r = await fetch("/api/opportunities/pipeline", {
    method: hasFilter ? "POST" : "GET",
    credentials: "include",
    cache: "no-store",
    headers: hasFilter ? { "content-type": "application/json" } : undefined,
    body: hasFilter
      ? JSON.stringify({
          ...buildOpportunityFilterRequest(filter),
          ...(search ? { search } : {}),
        })
      : undefined,
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || "Failed to load pipeline");
  return j.data as BoardDto;
}

async function postTransition(
  id: string,
  body: {
    toStage: CrmOpportunityStage;
    closeReasonCategory?: string;
    closeReason?: string;
  },
): Promise<void> {
  const r = await fetch(`/api/opportunities/${id}/transition`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || "Transition failed");
}

// ─── Component ────────────────────────────────────────────────────────────

export function OpportunityKanban({
  filterKey,
  filter,
  search,
}: {
  filterKey: string;
  filter: FilterPayload;
  search: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const board = useQuery({
    queryKey: [...PIPELINE_QUERY_KEY, filterKey] as const,
    queryFn: () => fetchPipeline(filter, search),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const [activeCard, setActiveCard] = useState<DealCard | null>(null);
  const [pendingClose, setPendingClose] = useState<
    | { id: string; toStage: "ClosedWon" | "ClosedLost"; fromStage: CrmOpportunityStage }
    | null
  >(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // ─── Mutation ───────────────────────────────────────────────────────────
  const transition = useMutation({
    mutationFn: async (vars: {
      id: string;
      toStage: CrmOpportunityStage;
      closeReasonCategory?: string;
      closeReason?: string;
    }) => {
      await postTransition(vars.id, {
        toStage: vars.toStage,
        closeReasonCategory: vars.closeReasonCategory,
        closeReason: vars.closeReason,
      });
    },
    onMutate: async ({ id, toStage }) => {
      await queryClient.cancelQueries({ queryKey: [...PIPELINE_QUERY_KEY, filterKey] });
      const prev = queryClient.getQueryData<BoardDto>([...PIPELINE_QUERY_KEY, filterKey]);
      if (!prev) return { prev: undefined };

      let card: DealCard | null = null;
      let fromStage: CrmOpportunityStage | null = null;
      for (const col of prev.columns) {
        const found = col.deals.find((d) => d.id === id);
        if (found) {
          card = found;
          fromStage = col.stage;
          break;
        }
      }
      if (!card || !fromStage || fromStage === toStage) return { prev };

      queryClient.setQueryData<BoardDto>([...PIPELINE_QUERY_KEY, filterKey], (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((c) => {
            if (c.stage === fromStage) {
              return {
                ...c,
                count: Math.max(0, c.count - 1),
                deals: c.deals.filter((d) => d.id !== id),
              };
            }
            if (c.stage === toStage) {
              return {
                ...c,
                count: c.count + 1,
                deals: [card!, ...c.deals],
              };
            }
            return c;
          }),
        };
      });
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([...PIPELINE_QUERY_KEY, filterKey], ctx.prev);
      toast.error(err instanceof Error ? err.message : "Move failed");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...PIPELINE_QUERY_KEY, filterKey] });
    },
  });

  // ─── Horizontal scroll edge detection ───────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const overflowing = el.scrollWidth > el.clientWidth + 1;
      setEdges({
        left: el.scrollLeft > 4,
        right: overflowing && el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [board.data?.columns.length]);

  // Mouse-wheel → horizontal scroll on the board (yields when columns can scroll vertically).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const target = e.target as HTMLElement | null;
      const colScroll = target?.closest('[data-column-scroll="true"]') as HTMLElement | null;
      if (colScroll) {
        const canScrollDown =
          e.deltaY > 0 &&
          colScroll.scrollTop + colScroll.clientHeight < colScroll.scrollHeight - 1;
        const canScrollUp = e.deltaY < 0 && colScroll.scrollTop > 0;
        if (canScrollDown || canScrollUp) return;
      }
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function findCard(id: string): { card: DealCard; stage: CrmOpportunityStage } | null {
    if (!board.data) return null;
    for (const col of board.data.columns) {
      const found = col.deals.find((d) => d.id === id);
      if (found) return { card: found, stage: col.stage };
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    const found = findCard(String(e.active.id));
    if (found) setActiveCard(found.card);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const cardId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || !overId.startsWith("col:")) return;
    const targetStage = overId.slice(4) as CrmOpportunityStage;
    const found = findCard(cardId);
    if (!found || found.stage === targetStage) return;

    if (targetStage === "ClosedWon" || targetStage === "ClosedLost") {
      setPendingClose({ id: cardId, toStage: targetStage, fromStage: found.stage });
      return;
    }
    transition.mutate({ id: cardId, toStage: targetStage });
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (board.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          <div className="h-4 w-40 animate-pulse rounded bg-crm-panel" />
          <div className="h-4 w-32 animate-pulse rounded bg-crm-panel" />
          <div className="h-4 w-44 animate-pulse rounded bg-crm-panel" />
        </div>
        <KanbanSkeleton columns={6} cardsPerColumn={3} />
      </div>
    );
  }
  if (board.error || !board.data) {
    return (
      <div className="p-6 text-sm text-red-600">
        Failed to load pipeline: {String((board.error as Error)?.message ?? "unknown")}
      </div>
    );
  }

  const data = board.data;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-crm-muted">Pipeline</span>{" "}
          <span className="text-base font-semibold tabular-nums">
            {formatINR(data.totalPipelineInr)}
          </span>
          {data.totalsByCurrency
            .filter((t) => t.currency !== "INR")
            .map((t) => (
              <span key={t.currency} className="ml-2 text-xs text-crm-muted">
                + {t.display} {t.currency}
              </span>
            ))}
        </div>
        <div>
          <span className="text-crm-muted">Weighted</span>{" "}
          <span className="font-semibold tabular-nums">{formatINR(data.totalWeightedInr)}</span>
        </div>
        <div>
          <span className="text-crm-muted">This quarter forecast</span>{" "}
          <span className="font-semibold tabular-nums">
            {formatINR(data.thisQuarterForecastInr)}
          </span>
        </div>
      </div>

      {/* At-risk chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
          Stuck deals: <b>{data.atRisk.stuckDeals}</b>
        </span>
        <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
          No activity 7d+: <b>{data.atRisk.noActivity7d}</b>
        </span>
        <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
          Closing this month: <b>{data.atRisk.closingThisMonth}</b>
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToWindowEdges]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="relative h-[calc(100vh-260px)] min-h-[420px]">
          <div
            ref={scrollRef}
            className="kanban-scroll flex h-full min-h-0 gap-4 overflow-x-auto overflow-y-hidden pb-2 pr-4 scroll-smooth snap-x"
          >
            {STAGE_ORDER.map((stage) => {
              const col = data.columns.find((c) => c.stage === stage);
              if (!col) return null;
              return <KanbanColumn key={stage} bucket={col} />;
            })}
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-crm-page via-crm-page/70 to-transparent transition-opacity duration-200 ${
              edges.left ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-crm-page via-crm-page/70 to-transparent transition-opacity duration-200 ${
              edges.right ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>

        <DragOverlay
          dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}
        >
          {activeCard ? <CardSurface card={activeCard} elevated /> : null}
        </DragOverlay>
      </DndContext>

      {pendingClose && (
        <CloseDealModal
          open
          toStage={pendingClose.toStage}
          loading={transition.isPending}
          onClose={() => setPendingClose(null)}
          onConfirm={({ closeReasonCategory, closeReason }) => {
            transition.mutate(
              {
                id: pendingClose.id,
                toStage: pendingClose.toStage,
                closeReasonCategory,
                closeReason,
              },
              { onSuccess: () => setPendingClose(null) },
            );
          }}
        />
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────

function KanbanColumn({ bucket }: { bucket: ColumnDto }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${bucket.stage}` });
  const palette = STAGE_PALETTE[bucket.stage];
  const isClosed = bucket.stage === "ClosedWon" || bucket.stage === "ClosedLost";

  return (
    <section
      ref={setNodeRef}
      aria-label={`${STAGE_LABEL[bucket.stage]} column`}
      className={`flex h-full w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-crm-panel/60 transition-colors ${
        isOver ? `border-transparent ring-2 ${palette.ring} bg-white` : "border-crm-border"
      }`}
    >
      <header
        className={`flex items-center justify-between gap-2 border-b border-crm-border px-3 py-2.5 ${palette.header}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${palette.dot}`} aria-hidden />
          <h3 className="truncate text-sm font-semibold text-crm-text">
            {STAGE_LABEL[bucket.stage]}
          </h3>
          {isClosed && (
            <span
              className="shrink-0 rounded-sm bg-white/70 px-1 py-px text-[9px] font-medium uppercase tracking-wider text-crm-muted"
              title="Dropping here will ask for a close reason."
            >
              asks reason
            </span>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${palette.count}`}
        >
          {bucket.count}
        </span>
      </header>

      {bucket.totalAmountInr > 0 && (
        <div className="border-b border-crm-border bg-white/40 px-3 py-1 text-[11px] text-crm-muted tabular-nums">
          {formatINR(bucket.totalAmountInr)}
          {bucket.totalsByCurrency
            .filter((t) => t.currency !== "INR")
            .slice(0, 1)
            .map((t) => (
              <span key={t.currency} className="ml-1">
                + {t.display}
              </span>
            ))}
        </div>
      )}

      <div data-column-scroll="true" className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {bucket.deals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-crm-border bg-white/50 px-3 py-8 text-center text-xs text-crm-muted">
            Drop a deal here
          </div>
        ) : (
          bucket.deals.map((card) => <DraggableCard key={card.id} card={card} />)
        )}
      </div>
    </section>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────

function DraggableCard({ card }: { card: DealCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`touch-none ${isDragging ? "opacity-30" : ""}`}
    >
      <CardSurface card={card} />
    </div>
  );
}

function CardSurface({ card, elevated }: { card: DealCard; elevated?: boolean }) {
  return (
    <article
      className={`group relative rounded-lg border border-crm-border bg-white p-3 transition ${
        elevated
          ? "rotate-2 cursor-grabbing shadow-crm-modal"
          : "cursor-grab shadow-sm hover:-translate-y-0.5 hover:shadow-crm-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/opportunities/${card.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-sm font-semibold text-crm-text hover:text-crm-blue"
          >
            {card.name}
          </Link>
          <p className="truncate text-xs text-crm-muted">{card.accountName || "—"}</p>
        </div>
        <GripVertical
          size={14}
          className="mt-0.5 shrink-0 text-crm-muted/40 transition group-hover:text-crm-muted"
          aria-hidden
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-accent-200 tabular-nums"
          title={
            card.weightedAmount != null
              ? `Weighted ${formatINR(card.weightedAmount)}`
              : undefined
          }
        >
          {card.amountDisplay}
          <span className="font-normal opacity-70">· {card.probability}%</span>
        </span>

        <div className="flex items-center gap-1.5">
          {card.isStale && (
            <span
              title="Stale: > 30 days in this stage"
              className="inline-flex items-center text-amber-600"
            >
              <AlertCircle size={12} />
            </span>
          )}
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-crm-blue-soft text-[10px] font-semibold text-crm-blue-dark"
            title={card.ownerName ?? "Unassigned"}
            aria-label={card.ownerName ?? "Unassigned"}
          >
            {initials(card.ownerName)}
          </span>
        </div>
      </div>
    </article>
  );
}
