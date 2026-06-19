"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import {
  Calendar, ChevronLeft, Save, CheckCircle2, AlertCircle, CalendarDays, CircleDollarSign,
} from "lucide-react";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/ui/select";
import { SkeletonLine } from "@/components/hrms/skeleton";

type WorkDay = "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";

interface PaySchedule {
  workWeek: WorkDay[];
  salaryCalcBasis: "ActualDaysInMonth" | "OrganisationWorkingDays";
  orgWorkingDays: number | null;
  payDayType: "LastWorkingDay" | "FixedDay";
  payDayOfMonth: number | null;
  payFrequency: "Monthly" | "SemiMonthly" | "BiWeekly" | "Weekly";
  firstPayrollMonth: string | null;
}

export default function PayScheduleSetupPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-6 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      <PayScheduleInner />
    </Suspense>
  );
}

function PayScheduleInner() {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/payroll/setup";

  const { data } = useQuery({
    queryKey: ["payroll", "pay-schedule"],
    queryFn: () => api.get<PaySchedule | null>("/api/v1/hrms/payroll/pay-schedule"),
  });

  const [form, setForm] = useState<PaySchedule>({
    workWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    salaryCalcBasis: "ActualDaysInMonth",
    orgWorkingDays: null,
    payDayType: "LastWorkingDay",
    payDayOfMonth: null,
    payFrequency: "Monthly",
    firstPayrollMonth: null,
  });
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.data) setForm({ ...form, ...data.data });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (body: PaySchedule) => api.put("/api/v1/hrms/payroll/pay-schedule", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      setErr(null);
      setFieldErrors({});
      setSaved(true);
      setTimeout(() => router.push(returnTo.startsWith("/") ? returnTo : "/payroll/setup"), 800);
    },
    onError: (e: Error) => {
      if (e instanceof ApiError) {
        setErr(e.message);
        setFieldErrors((e.details as Record<string, string[]>) ?? {});
      } else {
        setErr(e.message);
        setFieldErrors({});
      }
      setSaved(false);
    },
  });

  const daysInThisMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthLabel = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <Link href="/payroll/setup" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#3b82f6] mb-3">
        <ChevronLeft size={14} /> Back to Payroll Setup
      </Link>

      <div className="rounded-2xl bg-gradient-to-r from-[#16243A] to-[#2563eb] text-white px-6 py-5 shadow-sm flex items-start gap-4 mb-5">
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Calendar size={22} />
        </div>
        <div>
          <h1 className="font-serif-display text-2xl font-bold leading-tight">Pay Schedule</h1>
          <p className="text-xs text-white/75 mt-1">
            Decide when employees get paid and how monthly salary is computed.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (form.salaryCalcBasis === "OrganisationWorkingDays" && !form.orgWorkingDays)
            return setErr("Enter organisation working days");
          if (form.payDayType === "FixedDay" && !form.payDayOfMonth)
            return setErr("Enter pay day of month");
          saveMut.mutate(form);
        }}
        className="space-y-5"
      >
        {/* Card 1: Salary basis */}
        <Card icon={<CircleDollarSign size={16} />} title="Salary calculation basis" subtitle="Determines per-day salary and LOP deductions.">
          <div className="space-y-3">
            <ChoiceCard
              active={form.salaryCalcBasis === "ActualDaysInMonth"}
              onClick={() => setForm({ ...form, salaryCalcBasis: "ActualDaysInMonth" })}
              title="Actual days in a month"
              subtitle="Per-day salary varies — Feb 28 vs Jul 31"
            >
              {form.salaryCalcBasis === "ActualDaysInMonth" && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px]">
                  <CalendarDays size={12} className="text-[#2563eb]" />
                  <span className="text-gray-600">{monthLabel}:</span>
                  <span className="font-semibold text-[#1e40af]">{daysInThisMonth} days</span>
                </div>
              )}
            </ChoiceCard>

            <ChoiceCard
              active={form.salaryCalcBasis === "OrganisationWorkingDays"}
              onClick={() => setForm({ ...form, salaryCalcBasis: "OrganisationWorkingDays" })}
              title="Organisation working days"
              subtitle="Fixed days/month — same per-day salary all year"
            >
              {form.salaryCalcBasis === "OrganisationWorkingDays" && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-600">Days/month:</span>
                  <div className="w-24">
                    <Select
                      value={form.orgWorkingDays != null ? String(form.orgWorkingDays) : ""}
                      onChange={(v) => setForm({ ...form, orgWorkingDays: v ? Number(v) : null })}
                      size="sm"
                      placeholder="Select"
                      options={Array.from({ length: 31 }, (_, i) => i + 1).map((n) => ({ value: String(n), label: String(n) }))}
                    />
                  </div>
                </div>
              )}
            </ChoiceCard>
          </div>
        </Card>

        {/* Card 2: Pay day */}
        <Card icon={<Calendar size={16} />} title="Pay day" subtitle="Day of the month when salary hits employee accounts.">
          <div className="space-y-3">
            <ChoiceCard
              active={form.payDayType === "LastWorkingDay"}
              onClick={() => setForm({ ...form, payDayType: "LastWorkingDay" })}
              title="Last working day of every month"
              subtitle="Auto-adjusts for weekends / holidays"
            />

            <ChoiceCard
              active={form.payDayType === "FixedDay"}
              onClick={() => setForm({ ...form, payDayType: "FixedDay" })}
              title="Fixed day of every month"
              subtitle="Pick a specific day (e.g. 1st, 25th)"
            >
              {form.payDayType === "FixedDay" && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-600">Day:</span>
                  <div className="w-24">
                    <Select
                      value={form.payDayOfMonth != null ? String(form.payDayOfMonth) : ""}
                      onChange={(v) => setForm({ ...form, payDayOfMonth: v ? Number(v) : null })}
                      size="sm"
                      placeholder="1"
                      options={Array.from({ length: 31 }, (_, i) => i + 1).map((n) => ({ value: String(n), label: String(n) }))}
                    />
                  </div>
                  <span className="text-xs text-gray-600">of every month</span>
                </div>
              )}
            </ChoiceCard>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>
              When payday falls on a non-working day or holiday, employees are paid on the previous working day.
            </span>
          </div>
        </Card>

        {/* Status */}
        {saved && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
            <CheckCircle2 size={16} /> Pay schedule saved — redirecting…
          </div>
        )}
        {err && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle size={16} /> {err}
            </div>
            {Object.entries(fieldErrors).length > 0 && (
              <ul className="list-disc list-inside text-xs mt-1.5 space-y-0.5">
                {Object.entries(fieldErrors).map(([f, msgs]) => (
                  <li key={f}><strong>{f}:</strong> {msgs.join(", ")}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Sticky save bar */}
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3">
          <p className="text-xs text-gray-500">
            <span className="text-red-500">*</span> All fields are mandatory.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/payroll/setup" className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-60 text-white rounded-lg text-sm font-semibold shadow-sm"
            >
              <Save size={14} /> {saveMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Card({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
        <div className="w-9 h-9 rounded-lg bg-[#16243A]/5 text-[#16243A] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900 leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ChoiceCard({
  active, onClick, title, subtitle, children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border transition",
        active ? "border-[#3b82f6] bg-[#3b82f6]/5 ring-1 ring-[#3b82f6]/30" : "border-gray-200 hover:border-gray-300 bg-white",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 rounded-lg"
      >
        <div className="flex items-start gap-3">
          <span
            className={clsx(
              "w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0",
              active ? "border-[#3b82f6]" : "border-gray-300",
            )}
          >
            {active && <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />}
          </span>
          <div className="flex-1">
            <p className={clsx("text-sm font-semibold", active ? "text-[#1d4ed8]" : "text-gray-800")}>{title}</p>
            {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </button>
      {children && (
        <div className="px-4 pb-3 pl-11">{children}</div>
      )}
    </div>
  );
}
