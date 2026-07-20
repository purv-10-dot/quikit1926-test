"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Check, ArrowRight, Banknote, FileText, Calendar, Shield, Coins, Users, History, Rocket, Construction, Lock, Clock, Pencil, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { Modal } from "@/components/hrms/modal";

interface StepState {
  status: "NotStarted" | "InProgress" | "Completed";
  completed: boolean;
  locked: boolean;
  lockReason?: string;
}

interface SetupStatus {
  completedSteps: number;
  totalSteps: number;
  setupCompleted: boolean;
  steps: {
    orgDetails: StepState;
    taxDetails: StepState;
    paySchedule: StepState;
    statutoryComponents: StepState;
    salaryComponents: StepState;
    employees: StepState;
    priorPayroll: StepState;
  };
}

interface StepDef {
  key: keyof SetupStatus["steps"];
  num: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  estMinutes: number;
  requires?: keyof SetupStatus["steps"];
}

const STEPS: StepDef[] = [
  { key: "orgDetails", num: 1, title: "Add Organisation Details", description: "Company name, address, CIN/GSTIN.", icon: <Banknote size={16} />, href: "/settings/company", estMinutes: 3 },
  { key: "taxDetails", num: 2, title: "Provide your Tax Details", description: "PAN, TAN, TDS circle, tax deductor.", icon: <FileText size={16} />, href: "/payroll/setup/tax-details", estMinutes: 3 },
  { key: "paySchedule", num: 3, title: "Configure your Pay Schedule", description: "Work week, monthly salary basis, payday.", icon: <Calendar size={16} />, href: "/payroll/setup/pay-schedule", estMinutes: 2 },
  { key: "statutoryComponents", num: 4, title: "Set up Statutory Components", description: "EPF, ESI, Professional Tax, LWF, Statutory Bonus.", icon: <Shield size={16} />, href: "/payroll/setup/statutory", estMinutes: 5 },
  { key: "salaryComponents", num: 5, title: "Set up Salary Components", description: "Earnings, deductions, reimbursements.", icon: <Coins size={16} />, href: "/payroll/setup/salary-components", estMinutes: 4 },
  { key: "employees", num: 6, title: "Add Employees", description: "Assign salary structures and CTC.", icon: <Users size={16} />, href: "/payroll/employee-salaries", estMinutes: 5 },
  // Prior payroll moved out of Setup — it's ongoing operational work (every
  // mid-year joiner needs a YTD record), not a one-time onboarding step.
  // Lives in the Payroll sidebar as "Mid-year Joiners".
];

interface NotableItem { label: string; icon: string; href?: string; soon?: boolean; }
const NOTABLE: NotableItem[] = [
  { label: "Direct Deposit", icon: "🏦", soon: true },
  { label: "Salary Templates", icon: "💼", href: "/payroll/setup/salary-templates" },
  { label: "Auto Reminder for IT & POI Declaration", icon: "🔔", href: "/payroll/claims-declarations" },
];

export default function PayrollSetupPage() {
  const api = useApiClient();
  const [soonItem, setSoonItem] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "setup", "status"],
    queryFn: () => api.get<SetupStatus>("/api/v1/hrms/payroll/setup/status"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const status = data?.data;
  const completedCount = status?.completedSteps ?? 0;
  const totalCount = status?.totalSteps ?? 7;
  const percent = Math.round((completedCount / totalCount) * 100);
  const nextStep = STEPS.find((s) => !status?.steps[s.key]?.completed && (!s.requires || status?.steps[s.requires]?.completed));
  const totalMinsLeft = STEPS.filter((s) => !status?.steps[s.key]?.completed).reduce((sum, s) => sum + s.estMinutes, 0);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#166534] via-[#15803d] to-[#166534] text-white p-4 shadow-lg">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -right-16 -bottom-16 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center">
                <Rocket size={18} />
              </div>
              <h1 className="text-base font-semibold">Get started with QuikHRMS Payroll</h1>
            </div>
            <p className="text-xs text-white/80">Complete the following steps to have a hassle-free payroll experience.</p>
            {nextStep && !status?.setupCompleted && (
              <Link
                href={`${nextStep.href}${nextStep.href.includes("?") ? "&" : "?"}returnTo=/payroll/setup`}
                className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-white text-[#166534] hover:bg-[#faf4ef] rounded-full text-xs font-medium shadow-md transition group"
              >
                <Sparkles size={13} />
                Continue setup: {nextStep.title}
                <ArrowRight size={13} className="group-hover:translate-x-0.5 transition" />
              </Link>
            )}
            {status?.setupCompleted && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-300/40 rounded-lg text-[11px] font-medium">
                <Check size={14} /> Payroll setup completed
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-white/80 uppercase tracking-wider">Progress</p>
            <p className="text-2xl font-bold leading-tight">
              {isLoading ? "…" : completedCount}<span className="text-base text-white/60">/{totalCount}</span>
            </p>
            <p className="text-xs text-white/60 mb-1.5">{percent}% completed</p>
            <div className="w-44 h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-white transition-all duration-500 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            {totalMinsLeft > 0 && !status?.setupCompleted && (
              <p className="text-[11px] text-white/60 mt-2 inline-flex items-center gap-1">
                <Clock size={11} /> ~{totalMinsLeft} min remaining
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {STEPS.map((step) => {
            const stepState = status?.steps[step.key];
            const done = stepState?.completed ?? false;
            const inProgress = stepState?.status === "InProgress";
            const locked =
              stepState?.locked ||
              (!!step.requires && !status?.steps[step.requires]?.completed && !done);
            const isNext = nextStep?.key === step.key;
            const href = `${step.href}${step.href.includes("?") ? "&" : "?"}returnTo=/payroll/setup`;
            const blocker = locked ? STEPS.find((s) => s.key === step.requires) : null;

            const RowWrap: React.ElementType = done || !locked ? Link : "div";
            const wrapProps = done || !locked ? { href } : {};

            return (
              <li key={step.key} className="relative">
                {isNext && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#166534] to-[#15803d]" />
                )}
                <RowWrap
                  {...wrapProps}
                  className={clsx(
                    "group flex items-center gap-4 p-4 transition",
                    locked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    isNext ? "bg-gradient-to-r from-[#faf4ef] to-transparent" : "hover:bg-gray-50",
                  )}
                >
                  <div
                    className={clsx(
                      "w-9 h-9 rounded-full flex items-center justify-center shrink-0 ring-4 transition",
                      done
                        ? "bg-emerald-500 text-white ring-emerald-100"
                        : locked
                        ? "bg-gray-100 text-gray-400 ring-transparent"
                        : isNext
                        ? "bg-green-600 text-white ring-[#166534]/15 shadow-sm"
                        : "bg-white border-2 border-gray-300 text-gray-500 ring-transparent",
                    )}
                  >
                    {done ? <Check size={16} /> : locked ? <Lock size={14} /> : <span className="text-[13px] font-semibold">{step.num}</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx("shrink-0", done ? "text-emerald-600" : isNext ? "text-[#166534]" : "text-gray-400")}>
                        {step.icon}
                      </span>
                      <p className={clsx("text-[13px] font-semibold", locked ? "text-gray-500" : "text-gray-900")}>
                        {step.title}
                      </p>
                      {isNext && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-600 text-white rounded-full text-[11px] font-semibold uppercase tracking-wide">
                          <Sparkles size={10} /> Start Here
                        </span>
                      )}
                      {!done && !locked && inProgress && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[11px] font-medium uppercase tracking-wide">
                          In Progress
                        </span>
                      )}
                      {!done && !locked && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                          <Clock size={10} /> ~{step.estMinutes} min
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {locked && blocker
                        ? `Complete step ${blocker.num} (${blocker.title}) first`
                        : step.description}
                    </p>
                  </div>

                  {done ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-medium">
                        <Check size={11} /> Completed
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 group-hover:text-[#166534] transition">
                        <Pencil size={11} /> Edit
                      </span>
                    </div>
                  ) : locked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400 shrink-0">
                      <Lock size={11} /> Locked
                    </span>
                  ) : isNext ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#166534] group-hover:bg-[#15803d] text-white rounded-full text-xs font-medium shadow-sm transition shrink-0">
                      Complete Now <ArrowRight size={13} className="group-hover:translate-x-0.5 transition" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#166534] text-[#166534] group-hover:bg-[#166534] group-hover:text-white rounded-full text-xs font-medium transition shrink-0">
                      Complete Now <ArrowRight size={13} className="group-hover:translate-x-0.5 transition" />
                    </span>
                  )}
                </RowWrap>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Additional Notable Features</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {NOTABLE.map((n) => {
            const body = (
              <>
                <div className="text-2xl mb-2">{n.icon}</div>
                <p className="text-xs font-semibold text-gray-800">{n.label}</p>
                {n.soon ? (
                  <p className="text-[10px] text-amber-600 mt-1 uppercase tracking-wide">Coming Soon</p>
                ) : (
                  <p className="text-[10px] text-[#166534] mt-1 uppercase tracking-wide">Configure Now</p>
                )}
              </>
            );
            const cls = "surface-card p-4 text-center hover:border-[#166534]/30 hover:shadow-md transition cursor-pointer w-full";
            if (n.soon) {
              return (
                <button key={n.label} onClick={() => setSoonItem(n.label)} className={cls}>
                  {body}
                </button>
              );
            }
            return (
              <Link key={n.label} href={n.href!} className={cls}>
                {body}
              </Link>
            );
          })}
        </div>
      </div>

      <Modal open={!!soonItem} onClose={() => setSoonItem(null)} title={soonItem ?? ""} size="sm">
        <div className="p-4 text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
            <Construction size={26} className="text-amber-600" />
          </div>
          <p className="text-[13px] font-semibold text-gray-900">We are working on it</p>
          <p className="text-xs text-gray-600">
            {soonItem} is under active development. You&apos;ll be notified as soon as it&apos;s available.
          </p>
          <button onClick={() => setSoonItem(null)} className="btn btn-primary mt-2">
            Got it
          </button>
        </div>
      </Modal>
    </div>
  );
}
