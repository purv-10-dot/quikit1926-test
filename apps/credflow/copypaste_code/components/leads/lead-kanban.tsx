"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { GripVertical, Loader2, Phone, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CallButton } from "@/components/telephony/call-button";

interface KanbanCard {
  id: string;
  name: string;
  company: string | null;
  email?: string | null;
  phone?: string | null;
  score: number;
  ownerName: string | null;
  isStarred?: boolean;
  stage: string;
}

interface KanbanBucket {
  stage: string;
  total: number;
  items: KanbanCard[];
}

const FALLBACK_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];

interface Props {
  buckets?: KanbanBucket[];
  leads?: KanbanCard[];
  stages?: string[];
}

const STAGE_PALETTE = [
  { dot: "bg-slate-400", header: "bg-slate-50", count: "bg-slate-200 text-slate-700", ring: "ring-slate-300" },
  { dot: "bg-blue-400", header: "bg-blue-50", count: "bg-blue-200 text-blue-800", ring: "ring-blue-300" },
  { dot: "bg-violet-400", header: "bg-violet-50", count: "bg-violet-200 text-violet-800", ring: "ring-violet-300" },
  { dot: "bg-amber-400", header: "bg-amber-50", count: "bg-amber-200 text-amber-800", ring: "ring-amber-300" },
  { dot: "bg-rose-400", header: "bg-rose-50", count: "bg-rose-200 text-rose-800", ring: "ring-rose-300" },
  { dot: "bg-emerald-400", header: "bg-emerald-50", count: "bg-emerald-200 text-emerald-800", ring: "ring-emerald-300" },
] as const;

function paletteFor(index: number) {
  return STAGE_PALETTE[index % STAGE_PALETTE.length]!;
}

function scoreTier(score: number): string {
  if (score >= 90) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (score >= 70) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (score >= 40) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase() || "?";
}

const LOAD_MORE_BATCH = 100;
const KANBAN_QUERY_KEY = ["leads", "kanban", "board"] as const;
const DEFAULT_PER_STAGE = 100;

/**
 * Fetches the entire board. For stages the user has expanded with Load More we
 * issue a per-stage fetch with the higher limit and merge it back into the
 * default response — keeps "expanded" view sticky across refetches without
 * needing per-stage queries in the cache.
 */
async function fetchBoard(
  expandedLimits: Map<string, number>,
): Promise<KanbanBucket[]> {
  const res = await fetch(`/api/leads/kanban/board?perStage=${DEFAULT_PER_STAGE}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
  const json = (await res.json()) as { buckets: KanbanBucket[] };
  let fresh = json.buckets;

  if (expandedLimits.size > 0) {
    const expandedResults = await Promise.all(
      Array.from(expandedLimits.entries()).map(async ([stage, limit]) => {
        const r = await fetch(
          `/api/leads/kanban/board?stage=${encodeURIComponent(stage)}&perStage=${limit}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!r.ok) return null;
        const j = (await r.json()) as { buckets: KanbanBucket[] };
        return j.buckets[0] ?? null;
      }),
    );
    const overrides = new Map(
      expandedResults.filter((b): b is KanbanBucket => Boolean(b)).map((b) => [b.stage, b]),
    );
    fresh = fresh.map((b) => overrides.get(b.stage) ?? b);
  }

  return fresh;
}

export function LeadKanban({ buckets, leads, stages }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  // SSR seed: build buckets from whatever shape the page passed.
  const initialBuckets = useMemo<KanbanBucket[]>(() => {
    if (buckets) return buckets;
    const stageList = stages && stages.length > 0 ? stages : FALLBACK_STAGES;
    if (leads) {
      return stageList.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
        return { stage, total: items.length, items };
      });
    }
    return stageList.map((stage) => ({ stage, total: 0, items: [] }));
  }, [buckets, leads, stages]);

  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  // Per-stage expanded limits (sticky across refetches). Stored in a ref so
  // the queryFn closure always reads the latest value without re-keying.
  const expandedLimitsRef = useRef<Map<string, number>>(new Map());
  const [streamState, setStreamState] = useState<"connecting" | "live" | "unavailable">("connecting");

  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // ─── Mutation ───────────────────────────────────────────────────────────
  // Optimistic via setQueryData; rollback via snapshot; reconcile via invalidate.
  // No more useState<KanbanBucket[]> + router.refresh — single source of truth.
  const transition = useMutation({
    mutationFn: async (vars: { id: string; stage: string }) => {
      const res = await fetch(`/api/leads/${vars.id}/transition`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: vars.stage }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Transition failed (${res.status})`);
      }
      const j = await res.json();
      return j.data ?? j;
    },
    onMutate: async ({ id, stage: targetStage }) => {
      await queryClient.cancelQueries({ queryKey: KANBAN_QUERY_KEY });
      const prev = queryClient.getQueryData<KanbanBucket[]>(KANBAN_QUERY_KEY);
      if (!prev) return { prev: undefined };

      let sourceStage: string | null = null;
      let card: KanbanCard | null = null;
      for (const b of prev) {
        const found = b.items.find((c) => c.id === id);
        if (found) {
          sourceStage = b.stage;
          card = found;
          break;
        }
      }
      if (!card || !sourceStage || sourceStage === targetStage) return { prev };

      queryClient.setQueryData<KanbanBucket[]>(KANBAN_QUERY_KEY, (old) =>
        old?.map((b) => {
          if (b.stage === sourceStage) {
            return {
              ...b,
              total: Math.max(0, b.total - 1),
              items: b.items.filter((c) => c.id !== id),
            };
          }
          if (b.stage === targetStage) {
            return {
              ...b,
              total: b.total + 1,
              items: [{ ...card!, stage: targetStage }, ...b.items],
            };
          }
          return b;
        }),
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(KANBAN_QUERY_KEY, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Move failed");
    },
    onSettled: () => {
      // Server is authoritative — refetch to pick up any side effects
      // (auto-status change, automation-driven re-stage, etc.).
      queryClient.invalidateQueries({ queryKey: KANBAN_QUERY_KEY });
    },
  });

  const transitionPending = transition.isPending;

  // ─── Query (single source of truth) ─────────────────────────────────────
  const board = useQuery({
    queryKey: KANBAN_QUERY_KEY,
    queryFn: () => fetchBoard(expandedLimitsRef.current),
    initialData: initialBuckets,
    initialDataUpdatedAt: Date.now(),
    refetchInterval:
      activeCard || transitionPending
        ? false
        : streamState === "unavailable"
        ? 20000
        : 60000,
    refetchOnWindowFocus: true,
    staleTime: streamState === "unavailable" ? 10000 : 30000,
  });

  const state = board.data ?? initialBuckets;

  // ─── SSE realtime → invalidate (server is authoritative) ────────────────
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    let consecutiveFailures = 0;
    const GIVE_UP_AFTER = 3;

    function open() {
      if (cancelled) return;
      es = new EventSource("/api/leads/stream", { withCredentials: true });
      es.addEventListener("hello", () => {
        consecutiveFailures = 0;
        setStreamState("live");
      });
      es.addEventListener("lead", () => {
        // Invalidate triggers a fresh fetch. queryClient.cancelQueries() inside
        // onMutate prevents this from clobbering an in-flight optimistic update.
        queryClient.invalidateQueries({ queryKey: KANBAN_QUERY_KEY });
      });
      es.onerror = () => {
        consecutiveFailures += 1;
        if (consecutiveFailures >= GIVE_UP_AFTER) {
          es?.close();
          es = null;
          setStreamState("unavailable");
        } else {
          setStreamState("connecting");
        }
      };
    }
    open();

    const onFocus = () => {
      if (streamState === "unavailable") {
        consecutiveFailures = 0;
        setStreamState("connecting");
        open();
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [state.length]);

  // ─── Mouse-wheel → horizontal scroll on the board (yields to columns) ───
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const target = e.target as HTMLElement | null;
      const colScroll = target?.closest('[data-column-scroll="true"]') as HTMLElement | null;
      if (colScroll) {
        const canScrollDown =
          e.deltaY > 0 && colScroll.scrollTop + colScroll.clientHeight < colScroll.scrollHeight - 1;
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

  function findCard(id: string): { card: KanbanCard; stage: string } | null {
    for (const b of state) {
      const card = b.items.find((c) => c.id === id);
      if (card) return { card, stage: b.stage };
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
    const targetStage = overId.slice(4);
    const found = findCard(cardId);
    if (!found || found.stage === targetStage) return;
    transition.mutate({ id: cardId, stage: targetStage });
  }

  // ─── Load more — writes directly to RQ cache + remembers expansion ──────
  async function loadMore(stage: string) {
    const bucket = state.find((b) => b.stage === stage);
    if (!bucket) return;
    setLoadingStage(stage);
    try {
      const next = bucket.items.length + LOAD_MORE_BATCH;
      const url = `/api/leads/kanban/board?stage=${encodeURIComponent(stage)}&perStage=${next}`;
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = (await res.json()) as { buckets: KanbanBucket[] };
      const fresh = json.buckets.find((b) => b.stage === stage);
      if (!fresh) throw new Error("Stage missing in response");
      queryClient.setQueryData<KanbanBucket[]>(KANBAN_QUERY_KEY, (old) =>
        old?.map((b) => (b.stage === stage ? fresh : b)),
      );
      expandedLimitsRef.current.set(stage, next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setLoadingStage(null);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToWindowEdges]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="relative h-full min-h-0">
        <div
          aria-live="polite"
          className="pointer-events-none absolute right-3 top-1 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-crm-muted shadow-sm backdrop-blur-sm"
          title={
            streamState === "unavailable"
              ? "Live stream unavailable — polling every 20s"
              : streamState === "connecting"
              ? "Connecting to live stream…"
              : board.isFetching
              ? "Syncing latest data…"
              : board.dataUpdatedAt
              ? `Live · last sync ${new Date(board.dataUpdatedAt).toLocaleTimeString()}`
              : "Live"
          }
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${
                streamState === "live"
                  ? "bg-emerald-400"
                  : streamState === "unavailable"
                  ? "bg-slate-400"
                  : "bg-amber-400"
              } ${
                board.isFetching || streamState === "connecting" ? "animate-ping opacity-75" : "opacity-0"
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                streamState === "live"
                  ? "bg-emerald-500"
                  : streamState === "unavailable"
                  ? "bg-slate-500"
                  : "bg-amber-500"
              }`}
            />
          </span>
          {streamState === "unavailable"
            ? "Polling"
            : streamState === "connecting"
            ? "Connecting"
            : board.isFetching
            ? "Syncing"
            : "Live"}
        </div>
        <div
          ref={scrollRef}
          className="kanban-scroll flex h-full min-h-0 gap-4 overflow-x-auto overflow-y-hidden pb-2 pr-4 scroll-smooth snap-x"
        >
          {state.map((bucket, idx) => (
            <KanbanColumn
              key={bucket.stage}
              bucket={bucket}
              palette={paletteFor(idx)}
              loading={loadingStage === bucket.stage}
              onLoadMore={() => loadMore(bucket.stage)}
            />
          ))}
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
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {activeCard ? <CardSurface card={activeCard} elevated /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  bucket,
  palette,
  loading,
  onLoadMore,
}: {
  bucket: KanbanBucket;
  palette: (typeof STAGE_PALETTE)[number];
  loading: boolean;
  onLoadMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${bucket.stage}` });
  const remaining = bucket.total - bucket.items.length;

  return (
    <section
      ref={setNodeRef}
      aria-label={`${bucket.stage} column`}
      className={`flex h-full w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-crm-panel/60 transition-colors ${
        isOver ? `border-transparent ring-2 ${palette.ring} bg-white` : "border-crm-border"
      }`}
    >
      <header
        className={`flex items-center justify-between gap-2 border-b border-crm-border px-3 py-2.5 ${palette.header}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${palette.dot}`} aria-hidden />
          <h3 className="truncate text-sm font-semibold text-crm-text">{bucket.stage}</h3>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${palette.count}`}>
          {bucket.total}
        </span>
      </header>

      <div data-column-scroll="true" className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {bucket.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-crm-border bg-white/50 px-3 py-8 text-center text-xs text-crm-muted">
            Drop a lead here
          </div>
        ) : (
          bucket.items.map((card) => <DraggableCard key={card.id} card={card} />)
        )}

        {remaining > 0 && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-crm-border bg-white px-3 py-1.5 text-xs font-medium text-crm-blue shadow-sm transition hover:bg-crm-blue-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Loading…
              </>
            ) : (
              <>Load {Math.min(remaining, LOAD_MORE_BATCH)} more · {remaining} hidden</>
            )}
          </button>
        )}
      </div>
    </section>
  );
}

function DraggableCard({ card }: { card: KanbanCard }) {
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

function CardSurface({ card, elevated }: { card: KanbanCard; elevated?: boolean }) {
  return (
    <article
      className={`group relative rounded-lg border border-crm-border bg-white p-3 transition ${
        elevated ? "rotate-2 cursor-grabbing shadow-crm-modal" : "cursor-grab shadow-sm hover:-translate-y-0.5 hover:shadow-crm-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {card.isStarred && (
              <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Starred" />
            )}
            <Link
              href={`/leads/${card.id}`}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-sm font-semibold text-crm-text hover:text-crm-blue"
            >
              {card.name}
            </Link>
          </div>
          <p className="truncate text-xs text-crm-muted">{card.company || "—"}</p>
        </div>
        <GripVertical
          size={14}
          className="mt-0.5 shrink-0 text-crm-muted/40 transition group-hover:text-crm-muted"
          aria-hidden
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${scoreTier(card.score)}`}
          title={`Lead score ${card.score}/100`}
        >
          <span className="font-semibold">{card.score}</span>
          <span className="opacity-70">score</span>
        </span>

        <div className="flex items-center gap-1.5">
          {card.phone && (
            <span className="hidden items-center gap-1 text-[11px] text-crm-muted lg:inline-flex" title={card.phone}>
              <Phone size={10} />
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

      {!elevated && card.phone && (
        <div className="absolute -right-1 -top-1 opacity-0 transition group-hover:opacity-100">
          <CallButton to={card.phone ?? null} leadId={card.id} leadName={card.name} variant="icon" />
        </div>
      )}
    </article>
  );
}
