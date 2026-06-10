"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Eye,
  Lock,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useHabits, useSubmitMyResponse } from "@/lib/hooks/useHabits";
import {
  HABIT_KEYS,
  HABIT_DEFINITIONS,
  type HabitKey,
  type SubItemBits,
} from "@/lib/schemas/habitSchema";
import { EmptyState } from "@quikit/ui";
import type { MemberCampaignSummary } from "./types";

const EMPTY_BITS: SubItemBits = Object.fromEntries(
  HABIT_KEYS.map((k) => [k, [false, false, false, false]]),
) as SubItemBits;

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildTitle(c: MemberCampaignSummary): string {
  const base = `${c.quarter} ${c.year} Habits Assessment`;
  return c.totalRounds > 1 ? `${base} · Round ${c.round}` : base;
}

export function MemberFillView() {
  const { data, isLoading } = useHabits();
  // The member endpoint now returns an array of active campaigns. Guard
  // against stale admin-shape cache (also an array, but rows have different
  // fields) by validating shape items have `quarter` + `year` + `id`.
  const raw = data?.data;
  const campaigns: MemberCampaignSummary[] = useMemo(() => {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (c): c is MemberCampaignSummary =>
        !!c &&
        typeof c === "object" &&
        "id" in c &&
        "quarter" in c &&
        "year" in c &&
        "hasSubmitted" in c,
    );
  }, [raw]);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Auto-select when there's exactly one. Drop selection if it's gone.
  useEffect(() => {
    if (campaigns.length === 0) {
      setActiveId(null);
      return;
    }
    if (campaigns.length === 1) {
      setActiveId(campaigns[0].id);
      return;
    }
    if (activeId && !campaigns.find((c) => c.id === activeId)) {
      setActiveId(null);
    }
  }, [campaigns, activeId]);

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto space-y-3">
        <div className="h-20 bg-white border border-gray-200 rounded-2xl animate-pulse" />
        <div className="h-14 bg-white border border-gray-200 rounded-xl animate-pulse" />
        <div className="h-14 bg-white border border-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <EmptyState
            icon={Activity}
            title="No active Habits assessment right now"
            message="Your admin will launch the next quarterly assessment when it's time. You'll see the form here once it's live."
          />
        </div>
      </div>
    );
  }

  const active = activeId ? campaigns.find((c) => c.id === activeId) ?? null : null;

  if (!active) {
    return (
      <CampaignPicker
        campaigns={campaigns}
        onSelect={(id) => setActiveId(id)}
      />
    );
  }

  return (
    <MemberFillForm
      campaign={active}
      canSwitch={campaigns.length > 1}
      onBack={() => setActiveId(null)}
    />
  );
}

function CampaignPicker({
  campaigns,
  onSelect,
}: {
  campaigns: MemberCampaignSummary[];
  onSelect: (id: string) => void;
}) {
  const pending = campaigns.filter((c) => !c.hasSubmitted).length;
  const submitted = campaigns.filter((c) => c.hasSubmitted).length;
  const headline =
    pending > 0
      ? pending === 1
        ? "1 assessment is waiting for you"
        : `${pending} assessments are waiting for you`
      : "You're all caught up";

  return (
    <div className="min-h-full bg-gradient-to-b from-gray-50/60 via-white to-gray-50/40">
      <div className="px-4 sm:px-8 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_22rem] gap-6 lg:gap-8 max-w-7xl mx-auto">
          <main className="min-w-0">
            <header className="mb-6 sm:mb-8 relative overflow-hidden rounded-3xl bg-white border border-gray-200 shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-accent-50/60 via-transparent to-transparent pointer-events-none" />
              <div className="relative p-5 sm:p-7 flex items-start gap-4 sm:gap-5">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-md ring-4 ring-accent-100/50 flex-shrink-0">
                  <ClipboardList className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-700 mb-1.5">
                    Rockefeller Habits
                  </p>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight leading-tight">
                    {headline}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed max-w-xl">
                    Pick one of the assessments below to start. Your individual answers stay private —
                    only the aggregate is shared with your admin.
                  </p>
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    {pending > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        <span className="tabular-nums">{pending}</span> pending
                      </span>
                    )}
                    {submitted > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-[11px] font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="tabular-nums">{submitted}</span> submitted
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </header>

            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                Your assessments
              </h2>
              <span className="text-[10px] text-gray-400 tabular-nums">
                {campaigns.length} {campaigns.length === 1 ? "round" : "rounds"}
              </span>
            </div>

            <ul className="space-y-2.5">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <CampaignCard campaign={c} onSelect={() => onSelect(c.id)} />
                </li>
              ))}
            </ul>
          </main>

          <aside className="min-w-0">
            <HowItWorks />
          </aside>
        </div>
      </div>
    </div>
  );
}

function CampaignCard({
  campaign,
  onSelect,
}: {
  campaign: MemberCampaignSummary;
  onSelect: () => void;
}) {
  const deadlineLabel = formatDeadline(campaign.deadline);
  const urgency = deadlineUrgency(campaign.deadline);
  const isSubmitted = campaign.hasSubmitted;

  // Coloured accent strip on the left of the card — green for submitted,
  // red for urgent (≤24h), amber for soon (≤72h), accent for normal pending.
  const accentBar = isSubmitted
    ? "before:bg-green-400"
    : urgency === "urgent"
      ? "before:bg-red-400"
      : urgency === "soon"
        ? "before:bg-amber-400"
        : "before:bg-accent-500";

  return (
    <button
      onClick={onSelect}
      className={`
        relative w-full text-left bg-white border rounded-2xl shadow-sm transition-all p-4 sm:p-5 pl-5 sm:pl-6 group
        before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full ${accentBar}
        ${isSubmitted
          ? "border-gray-200 hover:border-gray-300"
          : "border-gray-200 hover:border-accent-300 hover:shadow-md hover:-translate-y-0.5"}
      `}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-start gap-3">
          <div
            className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${
              isSubmitted
                ? "bg-green-50 text-green-600"
                : urgency === "urgent"
                  ? "bg-red-50 text-red-600"
                  : urgency === "soon"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-accent-50 text-accent-600"
            }`}
          >
            {isSubmitted ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <PenLine className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-[15px] font-semibold text-gray-900 tracking-tight">
              {buildTitle(campaign)}
            </h3>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 leading-relaxed">
              Score your organisation against the 10 Rockefeller Habits.
            </p>
            {deadlineLabel && !isSubmitted && (
              <div
                className={`mt-2.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border ${
                  urgency === "urgent"
                    ? "bg-red-50 border-red-200 text-red-800"
                    : urgency === "soon"
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-gray-50 border-gray-200 text-gray-600"
                }`}
              >
                <CalendarClock className="h-3 w-3" />
                {urgency === "urgent" ? "Due today" : `Submit by ${deadlineLabel}`}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SubmissionBadge submitted={isSubmitted} submittedAt={campaign.submittedAt} />
          <span
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              isSubmitted
                ? "text-gray-700 bg-gray-50 group-hover:bg-gray-100"
                : "text-white bg-accent-600 group-hover:bg-accent-700 shadow-sm"
            }`}
          >
            {isSubmitted ? (
              <>
                <Eye className="h-3 w-3" /> View
              </>
            ) : (
              <>
                Start
                <span className="ml-0.5 transition-transform group-hover:translate-x-0.5">→</span>
              </>
            )}
          </span>
        </div>
      </div>
    </button>
  );
}

function deadlineUrgency(iso: string | null): "urgent" | "soon" | "ok" {
  if (!iso) return "ok";
  const now = Date.now();
  const deadlineEnd = new Date(iso).getTime() + 24 * 60 * 60 * 1000;
  const hoursLeft = (deadlineEnd - now) / (60 * 60 * 1000);
  if (hoursLeft <= 24) return "urgent";
  if (hoursLeft <= 72) return "soon";
  return "ok";
}

function HowItWorks() {
  const steps: Array<{ icon: typeof PenLine; title: string; body: string }> = [
    {
      icon: PenLine,
      title: "Fill the form",
      body: "Tick each sub-item your organisation consistently practices. Honest answers help most.",
    },
    {
      icon: ShieldCheck,
      title: "Stays private",
      body: "Your individual response is never shared. Only the aggregate goes to your admin.",
    },
    {
      icon: Sparkles,
      title: "See the trend",
      body: "Each quarter your admin closes the round and the org's overall % shows up on the dashboard.",
    },
  ];

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 lg:sticky lg:top-4">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          How it works
        </h2>
        <span className="text-[10px] text-gray-400">~5 min</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-5 leading-relaxed">
        Three steps. Once submitted, your answer is locked.
      </p>

      <ol className="relative space-y-5">
        {/* Vertical connector line behind the numbered chips */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px border-l border-dashed border-gray-200 pointer-events-none" />
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3.5">
            <span className="relative z-10 h-8 w-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white flex items-center justify-center text-xs font-bold tabular-nums shadow-sm ring-4 ring-white flex-shrink-0">
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="flex items-center gap-2 mb-0.5">
                <s.icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <h3 className="text-[13px] font-semibold text-gray-900 tracking-tight">
                  {s.title}
                </h3>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Need help? Your admin{" "}
          <span className="text-gray-600 font-medium">can extend the deadline</span> or answer
          questions about specific habits.
        </p>
      </div>
    </section>
  );
}

function SubmissionBadge({
  submitted,
  submittedAt,
}: {
  submitted: boolean;
  submittedAt: string | null;
}) {
  if (submitted) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 flex-shrink-0">
        <CheckCircle2 className="h-3 w-3" />
        Submitted
        {submittedAt && (
          <span className="text-green-600/70">
            · {new Date(submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Pending
    </span>
  );
}

function MemberFillForm({
  campaign,
  canSwitch,
  onBack,
}: {
  campaign: MemberCampaignSummary;
  canSwitch: boolean;
  onBack: () => void;
}) {
  const submit = useSubmitMyResponse(campaign.id);
  const [bits, setBits] = useState<SubItemBits>(EMPTY_BITS);
  const [expanded, setExpanded] = useState<HabitKey | null>(HABIT_KEYS[0]);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const deadlineLabel = useMemo(() => formatDeadline(campaign.deadline), [campaign.deadline]);
  const hasSubmitted = campaign.hasSubmitted || justSubmitted;
  const totalChecked = useMemo(
    () => HABIT_KEYS.reduce((sum, k) => sum + bits[k].filter(Boolean).length, 0),
    [bits],
  );
  const progressPct = Math.round((totalChecked / 40) * 100);

  function toggle(key: HabitKey, idx: number) {
    setBits((prev) => {
      const row = [...prev[key]] as [boolean, boolean, boolean, boolean];
      row[idx] = !row[idx];
      return { ...prev, [key]: row };
    });
  }

  async function handleSubmit() {
    setError(null);
    try {
      await submit.mutateAsync({ subItemBits: bits });
      setJustSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    }
  }

  if (hasSubmitted) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        {canSwitch && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 mb-3 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> All assessments
          </button>
        )}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-10 text-center">
          <div className="h-14 w-14 mx-auto mb-4 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">
            Thanks — your response was submitted
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1.5">
            {buildTitle(campaign)}
            {campaign.submittedAt && (
              <>
                {" · "}
                {new Date(campaign.submittedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </>
            )}
          </p>
          <div className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-[11px] font-medium text-gray-600">
            <Lock className="h-3 w-3" /> Submission locked
          </div>
          <p className="text-[11px] sm:text-xs text-gray-400 mt-4 max-w-md mx-auto leading-relaxed">
            Your individual response stays private. Only the aggregate is visible to your admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="max-w-3xl mx-auto w-full">
          {canSwitch && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 mb-2 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> All assessments
            </button>
          )}
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">
            {buildTitle(campaign)}
          </h1>
          <p className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-relaxed">
            Score your organisation against the 10 Rockefeller Habits. Your individual answers are
            private — only the aggregate is shared with the admin.
          </p>
          {deadlineLabel && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-800">
              <CalendarClock className="h-3 w-3" />
              Please submit by {deadlineLabel}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
        <div className="max-w-3xl mx-auto space-y-2.5">
          {HABIT_KEYS.map((key, idx) => {
            const def = HABIT_DEFINITIONS[key];
            const row = bits[key];
            const checked = row.filter(Boolean).length;
            const isOpen = expanded === key;
            return (
              <div
                key={key}
                className={`bg-white border rounded-xl overflow-hidden transition-colors ${
                  checked > 0 ? "border-accent-200" : "border-gray-200"
                }`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center gap-3 px-3.5 sm:px-4 py-3 text-left hover:bg-gray-50/70 transition-colors"
                >
                  <span className="text-[10px] font-bold text-gray-400 w-6 tabular-nums flex-shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-gray-900 min-w-0">
                    {def.label}
                  </span>
                  <span
                    className={`text-[10px] font-semibold tabular-nums flex-shrink-0 px-2 py-0.5 rounded-full ${
                      checked === 4
                        ? "bg-green-50 text-green-700"
                        : checked > 0
                          ? "bg-accent-50 text-accent-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {checked}/4
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-3.5 sm:px-4 py-3 space-y-2.5">
                    {def.subItems.map((item, i) => {
                      const isChecked = row[i];
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggle(key, i)}
                          className={`w-full flex items-start gap-3 text-left p-2 rounded-lg transition-colors ${
                            isChecked ? "bg-white" : "hover:bg-white"
                          }`}
                        >
                          <span
                            className={`mt-0.5 h-5 w-5 rounded-md flex-shrink-0 border-2 flex items-center justify-center transition-all ${
                              isChecked
                                ? "bg-accent-600 border-accent-600 scale-100"
                                : "bg-white border-gray-300 scale-95"
                            }`}
                          >
                            {isChecked && (
                              <svg viewBox="0 0 12 12" className="h-3 w-3 text-white">
                                <path
                                  d="M2.5 6.5 L5 9 L9.5 3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                          <span
                            className={`text-[12px] sm:text-[13px] leading-relaxed select-none ${
                              isChecked ? "text-gray-900" : "text-gray-600"
                            }`}
                          >
                            {item}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      <footer className="px-4 sm:px-6 py-3 border-t border-gray-200 bg-white flex-shrink-0">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full bg-accent-500 rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
              {totalChecked}/40 ticked
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submit.isPending}
            className="px-5 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
          >
            {submit.isPending ? "Submitting…" : "Submit response"}
          </button>
        </div>
      </footer>
    </div>
  );
}
