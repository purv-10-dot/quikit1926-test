"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users, TrendingUp, Zap, DollarSign,
  Target, Star, MessageSquare, BarChart2,
  CheckSquare, List, Calendar, Activity,
  Layers, ChevronRight, ArrowRight,
  UserCheck, GitBranch, LayoutGrid,
  PieChart, Briefcase, Clock,
} from "lucide-react";

interface PillarStats {
  people: {
    goals: { total: number; onTrack: number; atRisk: number };
    performanceReviews: { total: number };
    oneOnOnes: { total: number };
    feedback: { total: number };
    talent: { total: number };
    face: { total: number; assigned: number };
    pace: { total: number };
    surveys: { total: number; active: number };
  };
  strategy: {
    opsp: { status: string | null };
    habits: { total: number };
    swt: { total: number };
  };
  execution: {
    kpi: { total: number; onTrack: number; atRisk: number; offTrack: number };
    priorities: { total: number };
    www: { total: number };
    meetings: { total: number };
  };
}

async function fetchPillarStats(): Promise<PillarStats> {
  const res = await fetch("/api/pillars/stats");
  if (!res.ok) throw new Error("Failed to load stats");
  const json = await res.json();
  return json.data;
}

export default function PillarHubPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["pillar-stats"],
    queryFn: fetchPillarStats,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Hero banner */}
      <div
        className="flex-shrink-0 px-8 py-8"
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 35%, #4338ca 70%, #6366f1 100%)",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <LayoutGrid className="h-4 w-4 text-indigo-300" />
            <span className="text-xs text-indigo-300 font-medium uppercase tracking-widest">
              Scaling Up Framework
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Pillar Hub</h1>
          <p className="text-sm text-indigo-200">
            Four pillars that drive scalable growth — People, Strategy, Execution, Cash.
          </p>
        </div>
      </div>

      {/* Pillars */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* PEOPLE */}
          <PillarSection
            color="violet"
            icon={Users}
            title="People"
            subtitle="Happiness · Accountability"
            borderColor="border-l-violet-500"
            headerBg="bg-violet-50"
            iconBg="bg-violet-100"
            iconColor="text-violet-600"
            badgeBg="bg-violet-100"
            badgeText="text-violet-700"
          >
            <ModuleTile
              icon={Target}
              title="Goals / OKRs"
              description="Quarterly & annual objectives"
              href="/performance/goals/list"
              stats={
                isLoading
                  ? null
                  : [
                      { label: "Total", value: stats?.people.goals.total ?? 0, color: "text-gray-600" },
                      { label: "On track", value: stats?.people.goals.onTrack ?? 0, color: "text-green-600" },
                      { label: "At risk", value: stats?.people.goals.atRisk ?? 0, color: "text-amber-600" },
                    ]
              }
            />
            <ModuleTile
              icon={Star}
              title="Performance Reviews"
              description="360° feedback & appraisals"
              href="/performance/reviews"
              stats={
                isLoading
                  ? null
                  : [{ label: "Reviews", value: stats?.people.performanceReviews.total ?? 0, color: "text-gray-600" }]
              }
            />
            <ModuleTile
              icon={MessageSquare}
              title="1-on-1s"
              description="Structured check-ins"
              href="/performance/one-on-ones"
              stats={
                isLoading
                  ? null
                  : [{ label: "Scheduled", value: stats?.people.oneOnOnes.total ?? 0, color: "text-gray-600" }]
              }
            />
            <ModuleTile
              icon={Activity}
              title="Feedback"
              description="Continuous feedback loops"
              href="/performance/feedback"
              stats={
                isLoading
                  ? null
                  : [{ label: "Entries", value: stats?.people.feedback.total ?? 0, color: "text-gray-600" }]
              }
            />
            <ModuleTile
              icon={Briefcase}
              title="Talent Assessment"
              description="A-player identification"
              href="/performance/talent"
              stats={
                isLoading
                  ? null
                  : [{ label: "Assessed", value: stats?.people.talent.total ?? 0, color: "text-gray-600" }]
              }
            />
            <ModuleTile
              icon={UserCheck}
              title="OPPP"
              description="One-page personal plan"
              href="/performance/oppp"
            />
            <ModuleTile
              icon={BarChart2}
              title="NPS Survey"
              description="eNPS & cNPS feedback"
              href="/performance/survey"
              stats={
                isLoading
                  ? null
                  : [
                      { label: "Surveys", value: stats?.people.surveys.total ?? 0, color: "text-gray-600" },
                      { label: "Active", value: stats?.people.surveys.active ?? 0, color: "text-green-600" },
                    ]
              }
            />
            <ModuleTile
              icon={GitBranch}
              title="FACe"
              description="Function accountability chart"
              href="/performance/face"
              stats={
                isLoading
                  ? null
                  : [
                      { label: "Functions", value: stats?.people.face.total ?? 0, color: "text-gray-600" },
                      { label: "Assigned", value: stats?.people.face.assigned ?? 0, color: "text-green-600" },
                    ]
              }
            />
            <ModuleTile
              icon={Users}
              title="PACe"
              description="Process accountability chart"
              href="/performance/pace"
              stats={
                isLoading
                  ? null
                  : [{ label: "Processes", value: stats?.people.pace.total ?? 0, color: "text-gray-600" }]
              }
            />
          </PillarSection>

          {/* STRATEGY */}
          <PillarSection
            color="blue"
            icon={TrendingUp}
            title="Strategy"
            subtitle="Revenue · Growth"
            borderColor="border-l-blue-500"
            headerBg="bg-blue-50"
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            badgeBg="bg-blue-100"
            badgeText="text-blue-700"
          >
            <ModuleTile
              icon={Layers}
              title="OPSP"
              description="One-page strategic plan"
              href="/performance/opsp"
              stats={
                isLoading || !stats?.strategy.opsp.status
                  ? null
                  : [{ label: "Status", value: stats.strategy.opsp.status, color: "text-indigo-600" }]
              }
            />
            <ModuleTile
              icon={PieChart}
              title="Vision Summary"
              description="BHAG & core values"
              href="/performance/vision"
            />
            <ModuleTile
              icon={Activity}
              title="Habits"
              description="Rockefeller Habits Checklist"
              href="/performance/habits"
              stats={
                isLoading
                  ? null
                  : [{ label: "Assessments", value: stats?.strategy.habits.total ?? 0, color: "text-gray-600" }]
              }
            />
            <ModuleTile
              icon={TrendingUp}
              title="SWT"
              description="Strengths, weaknesses & trends"
              href="/performance/swt"
              stats={
                isLoading
                  ? null
                  : [{ label: "Entries", value: stats?.strategy.swt.total ?? 0, color: "text-gray-600" }]
              }
            />
            <ModuleTile
              icon={BarChart2}
              title="7 Strata"
              description="Strategic differentiation"
              href="#"
              comingSoon
            />
          </PillarSection>

          {/* EXECUTION */}
          <PillarSection
            color="green"
            icon={Zap}
            title="Execution"
            subtitle="Profit · Time"
            borderColor="border-l-green-500"
            headerBg="bg-green-50"
            iconBg="bg-green-100"
            iconColor="text-green-600"
            badgeBg="bg-green-100"
            badgeText="text-green-700"
          >
            <ModuleTile
              icon={BarChart2}
              title="KPIs"
              description="Key performance indicators"
              href="/performance/kpi"
              stats={
                isLoading
                  ? null
                  : [
                      { label: "Total", value: stats?.execution.kpi.total ?? 0, color: "text-gray-600" },
                      { label: "On track", value: stats?.execution.kpi.onTrack ?? 0, color: "text-green-600" },
                      { label: "At risk", value: stats?.execution.kpi.atRisk ?? 0, color: "text-amber-600" },
                    ]
              }
            />
            <ModuleTile
              icon={CheckSquare}
              title="Priorities / Rocks"
              description="Quarterly priorities"
              href="/performance/priority"
              stats={
                isLoading
                  ? null
                  : [{ label: "Active", value: stats?.execution.priorities.total ?? 0, color: "text-gray-600" }]
              }
            />
            <ModuleTile
              icon={List}
              title="WWW"
              description="Who, what, when action items"
              href="/performance/www"
              stats={
                isLoading
                  ? null
                  : [{ label: "Items", value: stats?.execution.www.total ?? 0, color: "text-gray-600" }]
              }
            />
            <ModuleTile
              icon={Calendar}
              title="Meeting Rhythm"
              description="Daily huddles & check-ins"
              href="/performance/huddle"
              stats={
                isLoading
                  ? null
                  : [{ label: "Huddles", value: stats?.execution.meetings.total ?? 0, color: "text-gray-600" }]
              }
            />
          </PillarSection>

          {/* CASH */}
          <PillarSection
            color="amber"
            icon={DollarSign}
            title="Cash"
            subtitle="Oxygen · Options"
            borderColor="border-l-amber-500"
            headerBg="bg-amber-50"
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
            badgeBg="bg-amber-100"
            badgeText="text-amber-700"
          >
            <ModuleTile
              icon={DollarSign}
              title="CASh"
              description="Cash acceleration summary"
              href="/performance/cash"
            />
            <ModuleTile
              icon={TrendingUp}
              title="Power of One"
              description="Cash flow levers"
              href="/performance/power-of-one"
            />
          </PillarSection>

        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PillarSectionProps {
  color: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  borderColor: string;
  headerBg: string;
  iconBg: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  children: React.ReactNode;
}

function PillarSection({
  icon: Icon,
  title,
  subtitle,
  borderColor,
  headerBg,
  iconBg,
  iconColor,
  badgeBg,
  badgeText,
  children,
}: PillarSectionProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden border-l-4 ${borderColor}`}>
      {/* Pillar header */}
      <div className={`px-5 py-3 flex items-center gap-3 ${headerBg} border-b border-gray-100`}>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <p className="text-[10px] text-gray-500">{subtitle}</p>
        </div>
        <span className={`ml-auto text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${badgeBg} ${badgeText}`}>
          Pillar
        </span>
      </div>
      {/* Module grid */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {children}
      </div>
    </div>
  );
}

interface StatItem {
  label: string;
  value: number | string;
  color: string;
}

interface ModuleTileProps {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  stats?: StatItem[] | null;
  comingSoon?: boolean;
}

function ModuleTile({ icon: Icon, title, description, href, stats, comingSoon }: ModuleTileProps) {
  const inner = (
    <div
      className={`relative flex flex-col gap-2 p-3.5 rounded-lg border transition-all group
        ${comingSoon
          ? "bg-gray-50 border-gray-200 opacity-60 cursor-default"
          : "bg-gray-50 border-gray-200 hover:border-indigo-300 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer"
        }`}
    >
      {comingSoon && (
        <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
          Soon
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 group-hover:border-indigo-200 transition-colors">
          <Icon className="h-3.5 w-3.5 text-gray-500 group-hover:text-indigo-500 transition-colors" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-800 leading-tight truncate">{title}</div>
          <div className="text-[10px] text-gray-400 leading-tight truncate">{description}</div>
        </div>
      </div>
      {stats && stats.length > 0 && (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className={`text-sm font-bold leading-none ${s.color}`}>{s.value}</div>
              <div className="text-[9px] text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}
      {!comingSoon && (
        <ChevronRight className="absolute bottom-3 right-3 h-3 w-3 text-gray-300 group-hover:text-indigo-400 transition-colors" />
      )}
    </div>
  );

  if (comingSoon) return inner;

  return <Link href={href}>{inner}</Link>;
}
