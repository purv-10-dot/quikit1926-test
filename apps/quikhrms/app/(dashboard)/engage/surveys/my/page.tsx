"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { ClipboardList, Lock, ChevronRight, CheckCircle2, Clock, Sparkles, BarChart3 } from "lucide-react";
import { SkeletonCards } from "@/components/hrms/skeleton";

interface MySurvey {
  id: string;
  title: string;
  type: string;
  isAnonymous: boolean;
  startDate: string;
  endDate: string;
  questionCount: number;
  hasResponded: boolean;
}

const typeStyles: Record<string, { bg: string; text: string; ring: string }> = {
  PulseCheck: { bg: "bg-green-50", text: "text-green-700", ring: "ring-green-200" },
  Engagement: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200" },
  Exit: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" },
  Onboarding: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  ENPS: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
  Custom: { bg: "bg-gray-50", text: "text-gray-700", ring: "ring-gray-200" },
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function daysLeft(d: string) {
  const ms = new Date(d).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export default function MySurveysPage() {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["surveys", "my"],
    queryFn: () => api.get<MySurvey[]>("/api/v1/hrms/engage/surveys/my"),
    staleTime: 30_000,
  });

  const surveys = data?.data ?? [];
  const pending = surveys.filter((s) => !s.hasResponded);
  const completed = surveys.filter((s) => s.hasResponded);

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F1F3D] via-[#14532d] to-[#16a34a] mb-4">
        <div className="relative px-6 py-7 flex items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/20 text-[11px] font-semibold tracking-widest text-white/90 uppercase">
              <ClipboardList size={12} /> Surveys for me
            </div>
            <h1 className="font-serif-display text-white text-base font-semibold mt-3">
              Your voice matters
            </h1>
            <p className="text-white/75 text-xs mt-1">Take a minute to share feedback. Most close in a few days.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/engage/surveys"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white text-[#0F1F3D] text-xs font-medium shadow-lg hover:shadow-xl transition-shadow"
            >
              <BarChart3 size={13} /> <span className="hidden sm:inline">Surveys &amp; pulse checks</span><span className="sm:hidden">All surveys</span>
            </Link>
            <div className="hidden md:flex items-center justify-center w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/20 shadow-2xl shrink-0">
              <Sparkles size={36} className="text-white/90" />
            </div>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <StatCard iconBg="bg-green-50" iconColor="text-green-600" Icon={ClipboardList} label="Pending" value={pending.length} caption="Awaiting your input" />
        <StatCard iconBg="bg-emerald-50" iconColor="text-emerald-600" Icon={CheckCircle2} label="Completed" value={completed.length} caption="Thanks for sharing" />
        <StatCard iconBg="bg-amber-50" iconColor="text-amber-600" Icon={Clock} label="Closing soon" value={surveys.filter((s) => !s.hasResponded && daysLeft(s.endDate) <= 3).length} caption="Within 3 days" />
      </div>

      {/* Pending */}
      <h2 className="text-[13px] font-semibold text-gray-900 mb-3">Awaiting your response</h2>
      {isLoading ? (
        <SkeletonCards count={2} />
      ) : pending.length === 0 ? (
        <div className="surface-card p-12 text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={24} className="text-emerald-600" />
          </div>
          <p className="font-serif-display text-[13px] font-semibold text-gray-900">All caught up</p>
          <p className="text-xs text-gray-500 mt-1">No pending surveys right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {pending.map((s, i) => <SurveyCard key={s.id} s={s} idx={i} />)}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <>
          <h2 className="text-[13px] font-semibold text-gray-900 mb-3">Completed</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completed.map((s, i) => <SurveyCard key={s.id} s={s} idx={i} />)}
          </div>
        </>
      )}
    </div>
  );
}

function SurveyCard({ s, idx }: { s: MySurvey; idx?: number }) {
  const ts = typeStyles[s.type] ?? typeStyles.Custom;
  const left = daysLeft(s.endDate);
  const closingSoon = left <= 3 && !s.hasResponded;

  return (
    <Link
      href={`/engage/surveys/${s.id}/take`}
      className={`row-stagger surface-card p-4 hover:shadow-md transition-all flex items-start gap-4 ${closingSoon ? "ring-1 ring-amber-200 bg-gradient-to-br from-amber-50/40 to-white" : ""}`}
      style={{ ["--i" as never]: Math.min(idx ?? 0, 10) }}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${ts.bg}`}>
        <ClipboardList size={20} className={ts.text} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${ts.bg} ${ts.text} ${ts.ring}`}>
            {s.type.replace("Survey", "")}
          </span>
          {s.isAnonymous && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 bg-gray-50 text-gray-600 ring-gray-200">
              <Lock size={9} /> Anonymous
            </span>
          )}
          {s.hasResponded ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200">
              <CheckCircle2 size={9} /> Done
            </span>
          ) : closingSoon ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 bg-amber-50 text-amber-700 ring-amber-200">
              <Clock size={9} /> {left === 0 ? "Closes today" : `${left}d left`}
            </span>
          ) : null}
        </div>
        <h3 className="font-serif-display text-[13px] font-semibold text-gray-900 mt-1.5 leading-snug">{s.title}</h3>
        <p className="text-xs text-gray-500 mt-1">
          {s.questionCount} {s.questionCount === 1 ? "question" : "questions"} · Closes {fmt(s.endDate)}
        </p>
      </div>
      <ChevronRight size={18} className="text-gray-300 mt-1" />
    </Link>
  );
}

function StatCard({
  iconBg, iconColor, Icon, label, value, caption,
}: {
  iconBg: string; iconColor: string;
  Icon: LucideIcon;
  label: string; value: number; caption: string;
}) {
  return (
    <div className="surface-card p-4 flex items-start gap-3">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon size={20} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-gray-900 truncate">{label}</p>
        <p className="font-serif-display text-xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
        <p className="text-[11px] text-gray-500 truncate">{caption}</p>
      </div>
    </div>
  );
}
