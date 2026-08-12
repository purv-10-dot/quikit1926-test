"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ENTERPRISE_PIPELINE_STEPS,
  resolveStepIndex,
  resolveTenantStageForStep,
  type PipelineStepDefinition,
} from "@/lib/services/leads/pipeline-stepper";

interface Props {
  leadId: string;
  currentStage: string;
  tenantStages: string[];
  canEdit: boolean;
  onStageChange?: (stage: string) => void;
}

/**
 * Chevron notch/point depth in px. Adjacent segments overlap by this amount
 * (negative margin) so each arrow point slots into the next segment's notch.
 */
const CHEVRON_DEPTH = 12;

/**
 * clip-path for a connected chevron segment. Applied via inline style (not a
 * Tailwind utility) so it renders reliably regardless of the content-glob.
 * First segment has a flat left edge (no left notch); last has a flat right
 * edge (no right point); middle segments have both.
 */
function chevronClip(isFirst: boolean, isLast: boolean): string {
  const d = `${CHEVRON_DEPTH}px`;
  if (isFirst && isLast) return "none";
  if (isFirst) {
    return `polygon(0 0, calc(100% - ${d}) 0, 100% 50%, calc(100% - ${d}) 100%, 0 100%)`;
  }
  if (isLast) {
    return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${d} 50%)`;
  }
  return `polygon(0 0, calc(100% - ${d}) 0, 100% 50%, calc(100% - ${d}) 100%, 0 100%, ${d} 50%)`;
}

/**
 * Colour encodes STATE: current = strong accent fill; completed = lighter accent
 * fill; upcoming = quiet outline. Won stays emerald when reached; Lost is rendered
 * rose + de-emphasised so the sequence doesn't imply Negotiation → Won → Lost.
 */
function segmentStyles(
  step: PipelineStepDefinition,
  isActive: boolean,
  isPast: boolean,
): string {
  // Won — emerald when reached; light emerald fill while still ahead so the
  // chevron shape reads against the white page (a ring can't trace the clip).
  if (step.tone === "won") {
    if (isActive) return "bg-emerald-600 text-white";
    if (isPast) return "bg-emerald-500/90 text-white hover:bg-emerald-600";
    return "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300";
  }
  // Lost — rose; faded fill when not reached so it reads as a distinct, optional
  // terminal rather than "the step after Won".
  if (step.tone === "lost") {
    if (isActive) return "bg-rose-600 text-white";
    if (isPast) return "bg-rose-500/90 text-white hover:bg-rose-600";
    return "bg-rose-50 text-rose-500/80 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300/70";
  }
  // Current stage — strong accent fill.
  if (isActive) {
    return "bg-accent-600 text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]";
  }
  // Completed — solid accent, slightly lighter than current.
  if (isPast) {
    return "bg-accent-500 text-white hover:bg-accent-600";
  }
  // Upcoming — light slate FILL (not white) so the chevron shape is visible
  // against the page; a ring is dropped because box-shadow rings can't follow
  // the clip-path's angled edges.
  return "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";
}

export function StagePipelineStepper({
  leadId,
  currentStage,
  tenantStages,
  canEdit,
  onStageChange,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const activeIndex = resolveStepIndex(currentStage);
  const progressPct = Math.round(
    (activeIndex / Math.max(ENTERPRISE_PIPELINE_STEPS.length - 1, 1)) * 100,
  );

  const applyStage = useCallback(
    async (step: PipelineStepDefinition, index: number) => {
      if (!canEdit || busy) return;
      if (index === activeIndex) return;
      const stage = resolveTenantStageForStep(step, tenantStages);
      setBusy(step.id);
      const prev = currentStage;
      onStageChange?.(stage);
      try {
        const res = await fetch(`/api/leads/${leadId}/transition`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage }),
        });
        const j = await res.json();
        if (!res.ok) {
          throw new Error(j.error ?? "Failed to update stage");
        }
        toast.success(`Moved to ${step.label}`);
        router.refresh();
      } catch (e) {
        onStageChange?.(prev);
        toast.error(e instanceof Error ? e.message : "Stage update failed");
      } finally {
        setBusy(null);
      }
    },
    [activeIndex, busy, canEdit, currentStage, leadId, onStageChange, router, tenantStages, toast],
  );

  return (
    <section
      className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      aria-label="Lead pipeline"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 sm:px-4 dark:border-slate-800 dark:bg-slate-800/60">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sales pipeline</p>
          <p className="text-sm text-slate-800 dark:text-slate-200">
            <span className="font-semibold text-accent-700 dark:text-accent-400">{currentStage}</span>
          </p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <span className="font-semibold tabular-nums text-accent-600">{progressPct}%</span>
          <span className="text-slate-500"> progress</span>
        </div>
      </div>

      <div className="h-1.5 bg-slate-100 dark:bg-slate-800" aria-hidden>
        <div
          className="h-full rounded-r-full bg-accent-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(6, progressPct))}%` }}
        />
      </div>

      <div className="crm-hscroll p-2 sm:p-3">
        <ol className="inline-flex min-w-full items-stretch" role="list">
          {ENTERPRISE_PIPELINE_STEPS.map((step, index) => {
            const isActive = index === activeIndex;
            const isPast = index < activeIndex;
            const isLoading = busy === step.id;
            const showCheck = isPast && step.tone !== "lost";
            const isFirst = index === 0;
            const isLast = index === ENTERPRISE_PIPELINE_STEPS.length - 1;

            return (
              <li
                key={step.id}
                className={
                  "relative flex min-w-[4.75rem] flex-1 sm:min-w-0 focus-within:z-10 " +
                  (isActive ? "z-10" : "")
                }
                style={{ marginLeft: isFirst ? undefined : -CHEVRON_DEPTH }}
              >
                <button
                  type="button"
                  disabled={!canEdit || !!busy}
                  onClick={() => void applyStage(step, index)}
                  aria-current={isActive ? "step" : undefined}
                  title={`${step.label} · ${step.probability}%`}
                  style={{ clipPath: chevronClip(isFirst, isLast) }}
                  className={
                    "flex h-full w-full flex-col items-center justify-center gap-0.5 py-2.5 pl-4 pr-3 transition sm:py-3 sm:pl-5 sm:pr-4 " +
                    segmentStyles(step, isActive, isPast) +
                    " disabled:cursor-not-allowed disabled:opacity-60 " +
                    " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-300 dark:focus-visible:ring-accent-500 " +
                    (isActive ? " ring-2 ring-inset ring-white/25 " : "")
                  }
                >
                  <span className="flex items-center gap-1 leading-none">
                    {isLoading ? (
                      <Loader2 size={13} className="animate-spin shrink-0" />
                    ) : showCheck ? (
                      <Check size={13} className="shrink-0" strokeWidth={3} />
                    ) : (
                      <span
                        className={
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold " +
                          (isActive || isPast
                            ? "bg-white/20 text-inherit"
                            : step.tone === "won"
                              ? "bg-emerald-100 text-emerald-800"
                              : step.tone === "lost"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-600")
                        }
                      >
                        {step.probability === 100 ? "✓" : step.probability === 0 ? "×" : index + 1}
                      </span>
                    )}
                    <span className="truncate text-[11px] font-semibold leading-tight sm:text-xs">
                      {step.label}
                    </span>
                  </span>
                  <span
                    className={
                      "text-[10px] font-medium tabular-nums " +
                      (isActive || isPast ? "text-white/80" : "text-slate-500")
                    }
                  >
                    {step.probability}% odds
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {!canEdit ? (
        <p className="border-t border-slate-100 px-3 py-1.5 text-center text-[11px] text-slate-500 dark:border-slate-800">
          View only
        </p>
      ) : null}
    </section>
  );
}
