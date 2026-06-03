"use client";

import { useMemo, useRef, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useHabits } from "@/lib/hooks/useHabits";
import { EmptyState } from "@quikit/ui";
import { LaunchAssessmentModal } from "./LaunchAssessmentModal";
import { AggregateView } from "./AggregateView";
import type { AdminCampaignRow } from "./types";

export function AdminHabitsView() {
  const { data, isLoading } = useHabits();
  const rows = useMemo(
    () => (data?.data as AdminCampaignRow[] | undefined) ?? [],
    [data],
  );

  // Order tabs left-to-right chronologically (oldest → newest) for a timeline feel.
  const orderedTabs = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        if (a.quarter !== b.quarter) return a.quarter.localeCompare(b.quarter);
        return a.round - b.round;
      }),
    [rows],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLaunchModal, setShowLaunchModal] = useState(false);

  const selected = useMemo(() => {
    if (selectedId) return rows.find((r) => r.id === selectedId) ?? null;
    return orderedTabs[orderedTabs.length - 1] ?? null;
  }, [rows, selectedId, orderedTabs]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="px-4 sm:px-8 py-5 sm:py-6 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href="/performance/goals"
          className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Pillar Hub
        </Link>
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Rockefeller Habits
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
              10-habit quarterly assessment — launch a campaign, members fill it anonymously,
              view the aggregate here.
            </p>
          </div>
          <button
            onClick={() => setShowLaunchModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg shadow-sm transition-colors flex-shrink-0"
          >
            <Plus className="h-4 w-4" /> New assessment
          </button>
        </div>
      </header>

      {orderedTabs.length > 0 && (
        <QuarterTabs
          tabs={orderedTabs}
          selectedId={selected?.id ?? null}
          onSelect={(id) => setSelectedId(id)}
          onAdd={() => setShowLaunchModal(true)}
        />
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && <LoadingSkeleton />}

        {!isLoading && rows.length === 0 && (
          <div className="p-4 sm:p-8">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
              <EmptyState
                icon={Activity}
                title="Launch your first Habits assessment"
                message="Create a draft for the current quarter, set a deadline, and launch it. Members will fill it anonymously; you'll see the aggregate here."
                action={{ label: "New assessment", onClick: () => setShowLaunchModal(true) }}
              />
            </div>
          </div>
        )}

        {!isLoading && selected && (
          <AggregateView
            key={selected.id}
            campaignId={selected.id}
            onDeleted={() => setSelectedId(null)}
          />
        )}
      </div>

      {showLaunchModal && (
        <LaunchAssessmentModal
          existingRows={rows}
          onClose={() => setShowLaunchModal(false)}
          onCreated={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}

function QuarterTabs({
  tabs,
  selectedId,
  onSelect,
  onAdd,
}: {
  tabs: AdminCampaignRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -240 : 240, behavior: "smooth" });
  }

  return (
    <div className="bg-white border-b border-gray-200 flex-shrink-0 relative">
      <button
        onClick={() => scroll("left")}
        className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => scroll("right")}
        className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto scrollbar-hide gap-1 px-4 sm:px-12"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((t) => {
          const isActive = t.id === selectedId;
          return <QuarterTab key={t.id} tab={t} isActive={isActive} onClick={() => onSelect(t.id)} />;
        })}
        <button
          onClick={onAdd}
          className="flex-shrink-0 px-3 py-3.5 text-xs font-medium text-gray-400 hover:text-accent-600 transition-colors flex items-center"
          aria-label="New assessment"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function QuarterTab({
  tab,
  isActive,
  onClick,
}: {
  tab: AdminCampaignRow;
  isActive: boolean;
  onClick: () => void;
}) {
  const shortYear = `'${String(tab.year).slice(-2)}`;
  const labelMain = `${tab.quarter} ${shortYear}`;
  const labelRound = !tab.isLegacy && tab.totalRounds > 1 ? ` · R${tab.round}` : "";

  let statusText = "";
  let statusColor = "bg-gray-400";
  if (tab.isLegacy) {
    statusText = "legacy";
    statusColor = "bg-gray-400";
  } else if (tab.status === "draft") {
    statusText = "draft";
    statusColor = "bg-amber-500";
  } else if (tab.status === "active") {
    statusText = "Active";
    statusColor = "bg-green-500";
  } else {
    statusText = "final";
    statusColor = "bg-blue-500";
  }

  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 px-4 py-3 text-left border-b-2 transition-colors ${
        isActive ? "border-accent-600" : "border-transparent hover:bg-gray-50"
      }`}
    >
      <div
        className={`text-sm font-bold tabular-nums tracking-tight ${
          isActive ? "text-gray-900" : "text-gray-700"
        }`}
      >
        {labelMain}
        {labelRound && (
          <span className={isActive ? "text-gray-700" : "text-gray-500"}>{labelRound}</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-500 whitespace-nowrap">
        <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
        {statusText}
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 sm:p-8 space-y-4">
      <div className="h-48 bg-white border border-gray-200 rounded-2xl animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4">
        <div className="h-96 bg-white border border-gray-200 rounded-2xl animate-pulse" />
        <div className="h-96 bg-white border border-gray-200 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}
