"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import {
  Building2,
  MapPin,
  Wallet,
  Check,
  ArrowRight,
  Rocket,
  ShieldCheck,
  ShieldAlert,
  Palmtree,
  CalendarDays,
  ClipboardList,
  Users,
  TrendingUp,
  Sparkles,
  LogOut,
  Mail,
  Home,
} from "lucide-react";
import { useApiClient } from "@/lib/hooks/use-api";
import type {
  HrmsSetupItem,
  HrmsSetupItemKey,
} from "@/lib/services/hrms-setup";

const ITEM_THEME: Record<HrmsSetupItemKey, { icon: React.ReactNode; bg: string; text: string }> = {
  departments: { icon: <Building2 size={18} />, bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  locations: { icon: <MapPin size={18} />, bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  coreApprovalChains: { icon: <ShieldAlert size={18} />, bg: "bg-teal-50 dark:bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
  payroll: { icon: <Wallet size={18} />, bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  roles: { icon: <ShieldCheck size={18} />, bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  leaveTypes: { icon: <Palmtree size={18} />, bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  leaveGroups: { icon: <Users size={18} />, bg: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
  holidays: { icon: <CalendarDays size={18} />, bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  onboardingTemplate: { icon: <ClipboardList size={18} />, bg: "bg-rose-50 dark:bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
  emailTemplates: { icon: <Mail size={18} />, bg: "bg-sky-50 dark:bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
  wfhQuota: { icon: <Home size={18} />, bg: "bg-indigo-50 dark:bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400" },
};

interface Me {
  firstName: string;
  lastName: string;
  displayName: string | null;
  profilePhoto: string | null;
}

interface Company {
  companyName: string;
  logo: string | null;
}

interface SetupChecklistProps {
  items: HrmsSetupItem[];
  completedCount: number;
  totalCount: number;
}

/**
 * Full-page first-run setup screen. Rendered as a full-viewport takeover by
 * SetupGate (not a dialog) while an admin's org has incomplete required
 * setup. Themed via accent-* + semantic colors, with dark-mode parity.
 */
export function SetupChecklist({ items, completedCount, totalCount }: SetupChecklistProps) {
  const api = useApiClient();
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const { data: meRes } = useQuery({
    queryKey: ["employees", "me"],
    queryFn: () => api.get<Me>("/api/v1/hrms/employees/me"),
    staleTime: 5 * 60_000,
  });
  const me = meRes?.data;
  const initials = me ? `${me.firstName[0] ?? ""}${me.lastName[0] ?? ""}`.toUpperCase() : "?";
  const fullName = me ? (me.displayName ?? `${me.firstName} ${me.lastName}`) : "Admin";

  const { data: companyRes } = useQuery({
    queryKey: ["settings", "company"],
    queryFn: () => api.get<Company>("/api/v1/hrms/settings/company"),
    staleTime: 10 * 60_000,
  });
  const companyName = companyRes?.data?.companyName ?? "QuikHRMS";
  const companyLogo = companyRes?.data?.logo ?? null;

  return (
    <div className="min-h-full bg-gray-50 dark:bg-[#0b1220]">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-b border-gray-200 bg-white dark:border-white/10 dark:bg-[#111a2e]">
        <div className="flex items-center gap-2.5 min-w-0">
          {companyLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={companyLogo} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-600 to-accent-700 text-white flex items-center justify-center shrink-0">
              <Rocket size={18} />
            </div>
          )}
          <span className="text-[15px] font-bold text-gray-900 dark:text-white truncate">{companyName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {me?.profilePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.profilePhoto} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white text-[11px] font-bold flex items-center justify-center">
                {initials}
              </span>
            )}
            <div className="hidden sm:block text-left leading-tight">
              <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white">{fullName}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Administrator</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:border-white/10 dark:text-gray-400 dark:hover:text-white"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="w-full mx-auto px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-8 flex flex-col lg:flex-row gap-8 xl:gap-12">
        {/* Left rail */}
        <aside className="lg:w-[300px] xl:w-[320px] 2xl:w-[360px] shrink-0 lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl border border-accent-100 bg-gradient-to-b from-accent-50 to-white p-6 flex flex-col items-center text-center dark:border-white/10 dark:from-accent-500/10 dark:to-transparent">
            <div className="relative w-24 h-24 rounded-full bg-white shadow-sm flex items-center justify-center dark:bg-white/5">
              <Rocket size={38} className="-rotate-45 text-accent-600 dark:text-accent-300" />
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white ring-4 ring-white dark:ring-[#111a2e]">
                <Check size={14} strokeWidth={3} />
              </span>
            </div>
          </div>

          <h2 className="mt-4 text-xl font-bold leading-snug text-gray-900 dark:text-white">
            Let&rsquo;s set up {companyName}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
            Complete these essential steps to unlock the full power of HRMS for your organisation.
          </p>

          <div className="mt-5 rounded-xl border border-accent-100 bg-accent-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-accent-700 dark:text-accent-300">
              <Sparkles size={13} /> Why setup is important?
            </p>
            <ul className="space-y-2 text-left">
              <li className="flex items-center gap-2 text-[12.5px] text-gray-600 dark:text-gray-300">
                <ShieldCheck size={14} className="shrink-0 text-accent-500" /> Secure your data and workflows
              </li>
              <li className="flex items-center gap-2 text-[12.5px] text-gray-600 dark:text-gray-300">
                <Users size={14} className="shrink-0 text-accent-500" /> Streamline HR processes
              </li>
              <li className="flex items-center gap-2 text-[12.5px] text-gray-600 dark:text-gray-300">
                <TrendingUp size={14} className="shrink-0 text-accent-500" /> Empower your teams
              </li>
            </ul>
          </div>
        </aside>

        {/* Right content */}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finish setting up {companyName}</h1>
          <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
            You are almost there! Complete the remaining steps to get started.
          </p>

          {/* Progress */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-[12.5px] font-semibold">
              <span className="text-gray-700 dark:text-gray-200">Setup progress</span>
              <span className="tabular-nums text-accent-600 dark:text-accent-300">
                {completedCount} of {totalCount} completed
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10"
              role="progressbar"
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
              aria-label="Setup progress"
            >
              <div
                className="h-full rounded-full bg-accent-600 transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Items */}
          <div className="mt-6 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item, i) => {
              const theme = ITEM_THEME[item.key];
              return (
                <div
                  key={item.key}
                  className={clsx(
                    "flex items-start gap-3 rounded-xl border p-4 transition-colors",
                    item.completed
                      ? "border-green-200 bg-green-50/50 dark:border-green-500/20 dark:bg-green-500/10"
                      : "border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.03]",
                  )}
                >
                  {item.completed ? (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent-200 text-[12px] font-bold text-accent-600 dark:border-accent-500/30 dark:text-accent-300">
                      {i + 1}
                    </span>
                  )}
                  <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", theme.bg, theme.text)}>
                    {theme.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-gray-900 dark:text-white">
                      {i + 1}. {item.title}
                    </p>
                    {item.completed ? (
                      <p className="mt-0.5 text-[12px] text-gray-400 dark:text-gray-500">Completed</p>
                    ) : (
                      <p className="mt-0.5 text-[12px] leading-snug text-gray-500 dark:text-gray-400">
                        <span className={clsx("font-semibold", item.blocking ? "text-red-500" : "text-accent-600 dark:text-accent-300")}>
                          {item.blocking ? "Required" : "Recommended"}
                        </span>
                        {" · "}
                        {item.description}
                      </p>
                    )}
                    {!item.completed && item.progress && item.progress.total > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-accent-500 transition-[width] duration-300"
                            style={{ width: `${Math.round((item.progress.done / item.progress.total) * 100)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-[11px] text-gray-500 dark:text-gray-400">
                          {item.progress.done} of {item.progress.total} completed
                        </span>
                      </div>
                    )}
                    {!item.completed && (
                      <Link
                        href={item.href}
                        className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-accent-200 px-3 py-1.5 text-[12.5px] font-semibold text-accent-600 transition-colors hover:bg-accent-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:border-accent-500/30 dark:text-accent-300 dark:hover:bg-white/5"
                      >
                        Set up
                        <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
