"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { Check, Layers, CalendarCheck, ShieldAlert } from "lucide-react";

/** Minimal shape the wizard reads from a leave type. */
export interface LeaveTypeRules {
  id: string;
  name: string;
  code: string;
  maxBalance: number;
  isUnlimited?: boolean | null;
  noAccrualJoinAfterDay?: number | null;
  isCarryForward?: boolean | null;
  maxCarryForward?: number | null;
  isNegativeBalanceAllowed?: boolean | null;
  maxNegativeBalance?: number | null;
  isHalfDayAllowed?: boolean | null;
  selfApplyAllowed?: boolean | null;
  requiresApproval?: boolean | null;
  advanceNoticeDays?: number | null;
  applicableAfterDays?: number | null;
  applicableAfterRef?: string | null;
  backdateCutoffDay?: number | null;
  requiresDocumentation?: boolean | null;
  documentationAfterDays?: number | null;
  documentationType?: string | null;
  blockIfBalanceLeaveTypeId?: string | null;
  requiresComment?: boolean | null;
  maxConsecutiveDays?: number | null;
  maxDaysPerMonth?: number | null;
  applyCutoffDay?: number | null;
  minGapDays?: number | null;
  includesHolidays?: boolean | null;
  includesWeekoffs?: boolean | null;
  blockedDuringNotice?: boolean | null;
}

const STEPS = [
  { key: "accrual", label: "Accrual & Accumulation", icon: Layers },
  { key: "applying", label: "Applying Leave & Approvals", icon: CalendarCheck },
  { key: "restrictions", label: "Additional Restrictions", icon: ShieldAlert },
];

// ── Small UI atoms ──────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={clsx("relative w-10 h-[22px] rounded-full transition shrink-0 mt-0.5", on ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600")}
    >
      <span className={clsx("absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform", on && "translate-x-[18px]")} />
    </button>
  );
}

function Rule({ on, onToggle, title, desc, children }: {
  on: boolean; onToggle: (v: boolean) => void; title: string; desc?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border border-gray-200 dark:border-white/10 rounded-xl p-3.5 hover:border-gray-300 transition">
      <Toggle on={on} onChange={onToggle} />
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-gray-800">{title}</p>
        {desc && <p className="text-[12px] text-gray-500 mt-0.5">{desc}</p>}
        {on && children && <div className="mt-2.5">{children}</div>}
      </div>
    </div>
  );
}

const inlineBox = "flex flex-wrap items-center gap-2 text-[13px] text-gray-700 bg-gray-50 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/15 rounded-lg px-3 py-2";
const numCls = "w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center font-semibold";

// ── Wizard ──────────────────────────────────────────────────────────────────
export function LeaveRulesWizard({ leaveType, allTypes, onClose }: {
  leaveType: LeaveTypeRules;
  allTypes: { id: string; name: string; code: string }[];
  onClose: () => void;
}) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);

  const [f, setF] = useState(() => ({
    // Step 1
    unlimited: !!leaveType.isUnlimited,
    daysPerYear: leaveType.maxBalance ?? 0,
    carryForward: !!leaveType.isCarryForward,
    maxCarryForward: leaveType.maxCarryForward ?? null as number | null,
    negativeBalance: !!leaveType.isNegativeBalanceAllowed,
    maxNegativeBalance: leaveType.maxNegativeBalance ?? null as number | null,
    joinCutoffOn: leaveType.noAccrualJoinAfterDay != null,
    noAccrualJoinAfterDay: leaveType.noAccrualJoinAfterDay ?? 4,
    // Step 2
    halfDay: leaveType.isHalfDayAllowed ?? true,
    selfApply: leaveType.selfApplyAllowed ?? true,
    requiresApproval: leaveType.requiresApproval ?? true,
    advanceOn: leaveType.advanceNoticeDays != null,
    advanceNoticeDays: leaveType.advanceNoticeDays ?? 1,
    newJoinerOn: (leaveType.applicableAfterDays ?? 0) > 0,
    applicableAfterDays: leaveType.applicableAfterDays ?? 30,
    applicableAfterRef: leaveType.applicableAfterRef ?? "JoiningDate",
    backdateOn: leaveType.backdateCutoffDay != null,
    backdateCutoffDay: leaveType.backdateCutoffDay ?? 12,
    attachmentOn: !!leaveType.requiresDocumentation,
    documentationAfterDays: leaveType.documentationAfterDays ?? 3,
    documentationType: leaveType.documentationType ?? "",
    blockBalanceOn: !!leaveType.blockIfBalanceLeaveTypeId,
    blockIfBalanceLeaveTypeId: leaveType.blockIfBalanceLeaveTypeId ?? "",
    requiresComment: !!leaveType.requiresComment,
    // Step 3
    maxConsecOn: leaveType.maxConsecutiveDays != null,
    maxConsecutiveDays: leaveType.maxConsecutiveDays ?? 5,
    maxMonthOn: leaveType.maxDaysPerMonth != null,
    maxDaysPerMonth: leaveType.maxDaysPerMonth ?? 3,
    applyCutoffOn: leaveType.applyCutoffDay != null,
    applyCutoffDay: leaveType.applyCutoffDay ?? 20,
    minGapOn: leaveType.minGapDays != null,
    minGapDays: leaveType.minGapDays ?? 7,
    sandwichHoliday: !!leaveType.includesHolidays,
    sandwichWeekoff: !!leaveType.includesWeekoffs,
    blockedDuringNotice: !!leaveType.blockedDuringNotice,
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const payload = useMemo(() => ({
    isUnlimited: f.unlimited,
    maxBalance: f.unlimited ? 0 : f.daysPerYear,
    accrualCount: f.unlimited ? 0 : f.daysPerYear,
    isCarryForward: f.carryForward,
    maxCarryForward: f.carryForward ? (f.maxCarryForward ?? null) : null,
    isNegativeBalanceAllowed: f.negativeBalance,
    maxNegativeBalance: f.negativeBalance ? (f.maxNegativeBalance ?? null) : null,
    noAccrualJoinAfterDay: f.joinCutoffOn ? f.noAccrualJoinAfterDay : null,
    isHalfDayAllowed: f.halfDay,
    selfApplyAllowed: f.selfApply,
    requiresApproval: f.requiresApproval,
    advanceNoticeDays: f.advanceOn ? f.advanceNoticeDays : null,
    applicableAfterDays: f.newJoinerOn ? f.applicableAfterDays : 0,
    applicableAfterRef: f.applicableAfterRef,
    backdateCutoffDay: f.backdateOn ? f.backdateCutoffDay : null,
    requiresDocumentation: f.attachmentOn,
    documentationAfterDays: f.attachmentOn ? f.documentationAfterDays : null,
    documentationType: f.attachmentOn ? (f.documentationType.trim() || null) : null,
    blockIfBalanceLeaveTypeId: f.blockBalanceOn ? (f.blockIfBalanceLeaveTypeId || null) : null,
    requiresComment: f.requiresComment,
    maxConsecutiveDays: f.maxConsecOn ? f.maxConsecutiveDays : null,
    maxDaysPerMonth: f.maxMonthOn ? f.maxDaysPerMonth : null,
    applyCutoffDay: f.applyCutoffOn ? f.applyCutoffDay : null,
    minGapDays: f.minGapOn ? f.minGapDays : null,
    includesHolidays: f.sandwichHoliday,
    includesWeekoffs: f.sandwichWeekoff,
    blockedDuringNotice: f.blockedDuringNotice,
  }), [f]);

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/api/v1/hrms/leaves/types/${leaveType.id}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-types"] }); toast.success("Leave rules saved"); onClose(); },
    onError: () => toast.error("Couldn't save rules"),
  });

  const otherTypes = allTypes.filter((t) => t.id !== leaveType.id);

  return (
    <div>
      {/* Stepper */}
      <div className="grid grid-cols-3 mb-3">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "current" : "upcoming";
          const Icon = s.icon;
          return (
            <button key={s.key} type="button" onClick={() => setStep(i)}
              className="relative flex flex-col items-center gap-2 text-center px-1">
              {i < STEPS.length - 1 && (
                <span className={clsx("absolute top-4 left-1/2 h-0.5 w-full", i < step ? "bg-green-500" : "bg-gray-200 dark:bg-white/10")} />
              )}
              <span className={clsx(
                "relative z-10 w-9 h-9 rounded-full grid place-items-center border-2 transition",
                state === "current" ? "border-green-600 bg-green-600 text-white shadow-[0_0_0_5px] shadow-green-100 dark:shadow-green-900/40"
                  : state === "done" ? "border-green-500 bg-green-500 text-white"
                  : "border-gray-300 dark:border-white/20 bg-white dark:bg-transparent text-gray-400",
              )}>
                {state === "done" ? <Check size={16} /> : <Icon size={15} />}
              </span>
              <span className={clsx("text-[11.5px] font-semibold max-w-[130px] leading-tight",
                state === "upcoming" ? "text-gray-400" : "text-gray-700 dark:text-gray-200")}>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-gray-100 pt-3 max-h-[calc(100dvh-250px)] overflow-y-auto pr-0.5">
        {/* ── Step 1 ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <p className="text-[15px] font-semibold text-gray-800 mb-2">How many {leaveType.name} does an employee get each year?</p>
              <div className="inline-flex p-1 gap-1 bg-gray-100 dark:bg-white/5 rounded-xl mb-3">
                <button type="button" onClick={() => set("unlimited", false)}
                  className={clsx("px-4 py-1.5 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5", !f.unlimited ? "bg-white dark:bg-white/10 shadow-sm text-gray-800" : "text-gray-500")}>
                  {!f.unlimited && <Check size={13} className="text-green-600" />} Fixed days
                </button>
                <button type="button" onClick={() => set("unlimited", true)}
                  className={clsx("px-4 py-1.5 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5", f.unlimited ? "bg-white dark:bg-white/10 shadow-sm text-gray-800" : "text-gray-500")}>
                  {f.unlimited && <Check size={13} className="text-green-600" />} Unlimited
                </button>
              </div>
              {!f.unlimited && (
                <div className="flex items-center gap-3">
                  <NumberInput allowDecimal={false} min={0} value={f.daysPerYear} onChange={(v) => set("daysPerYear", v ?? 0)} className={numCls} />
                  <span className="text-sm text-gray-500 font-medium">days / year</span>
                </div>
              )}
              <p className="text-[12px] text-gray-400 mt-2">Credited yearly and reset each year. New joiners are prorated automatically.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              <Rule on={f.carryForward} onToggle={(v) => set("carryForward", v)}
                title="Carry forward unused leave" desc="Unused days roll over to next year, up to a cap.">
                <div className={inlineBox}>Max carry forward
                  <NumberInput allowDecimal={false} min={0} value={f.maxCarryForward} placeholder="days" onChange={(v) => set("maxCarryForward", v)} className={numCls} /> days
                </div>
              </Rule>
              <Rule on={f.negativeBalance} onToggle={(v) => set("negativeBalance", v)}
                title="Allow negative balance" desc="Employees can apply beyond the available balance.">
                <div className={inlineBox}>Up to
                  <NumberInput allowDecimal={false} min={0} value={f.maxNegativeBalance} placeholder="days" onChange={(v) => set("maxNegativeBalance", v)} className={numCls} /> days in negative
                </div>
              </Rule>
              <Rule on={f.joinCutoffOn} onToggle={(v) => set("joinCutoffOn", v)}
                title="Withhold leave for late-month joiners" desc="No credit for that period if they join later in the month.">
                <div className={inlineBox}>No leave if joining after day
                  <NumberInput allowDecimal={false} min={1} max={31} value={f.noAccrualJoinAfterDay} onChange={(v) => set("noAccrualJoinAfterDay", v ?? 1)} className={numCls} /> of the month
                </div>
              </Rule>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <Rule on={f.halfDay} onToggle={(v) => set("halfDay", v)} title="Allow partial / half-day leave" desc="Employees can apply for half a day." />
            <Rule on={f.selfApply} onToggle={(v) => set("selfApply", v)} title="Employee can see & apply for this leave" desc="Appears in the employee's Apply Leave list." />
            <Rule on={f.requiresApproval} onToggle={(v) => set("requiresApproval", v)} title="Require approval" desc="Off = auto-approved on submit." />
            <Rule on={f.advanceOn} onToggle={(v) => set("advanceOn", v)} title="Require advance notice" desc="Must be applied before the leave starts.">
              <div className={inlineBox}>Apply at least
                <NumberInput allowDecimal={false} min={0} value={f.advanceNoticeDays} onChange={(v) => set("advanceNoticeDays", v ?? 0)} className={numCls} /> day(s) before
              </div>
            </Rule>
            <Rule on={f.newJoinerOn} onToggle={(v) => set("newJoinerOn", v)} title="New-joiner eligibility" desc="Only allow applying after a waiting period.">
              <div className={inlineBox}>Can apply
                <NumberInput allowDecimal={false} min={0} value={f.applicableAfterDays} onChange={(v) => set("applicableAfterDays", v ?? 0)} className={numCls} /> days after their
                <div className="w-40"><Select value={f.applicableAfterRef} onChange={(v) => set("applicableAfterRef", v)}
                  options={[{ value: "JoiningDate", label: "Joining Date" }, { value: "ConfirmationDate", label: "Confirmation Date" }]} /></div>
              </div>
            </Rule>
            <Rule on={f.backdateOn} onToggle={(v) => set("backdateOn", v)} title="Limit back-dated leave" desc="Block applying for past dates late in the month.">
              <div className={inlineBox}>Prevent back-dated leave after day
                <NumberInput allowDecimal={false} min={1} max={31} value={f.backdateCutoffDay} onChange={(v) => set("backdateCutoffDay", v ?? 1)} className={numCls} /> of the month
              </div>
            </Rule>
            <Rule on={f.attachmentOn} onToggle={(v) => set("attachmentOn", v)} title="Require attachment for long leave" desc="e.g. medical certificate for longer sick leave.">
              <div className={inlineBox}>Require a document if duration is more than
                <NumberInput allowDecimal={false} min={0} value={f.documentationAfterDays} onChange={(v) => set("documentationAfterDays", v ?? 0)} className={numCls} /> days
              </div>
              <div className={clsx(inlineBox, "mt-2")}>Document required:
                <input type="text" value={f.documentationType} onChange={(e) => set("documentationType", e.target.value)}
                  placeholder="e.g. Medical Certificate" maxLength={100}
                  className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm" />
              </div>
            </Rule>
            <Rule on={f.blockBalanceOn} onToggle={(v) => set("blockBalanceOn", v)} title="Not available while another leave has balance" desc="Force employees to exhaust another leave type first.">
              <div className={inlineBox}>Block while balance remains in
                <div className="w-52"><Select value={f.blockIfBalanceLeaveTypeId} onChange={(v) => set("blockIfBalanceLeaveTypeId", v)}
                  placeholder="Select leave type"
                  options={otherTypes.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))} /></div>
              </div>
            </Rule>
            <Rule on={f.requiresComment} onToggle={(v) => set("requiresComment", v)} title="Require a comment when applying" desc="Employee must give a reason." />
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <Rule on={f.maxConsecOn} onToggle={(v) => set("maxConsecOn", v)} title="Limit consecutive days" desc="Cap how many days can be taken in a row.">
              <div className={inlineBox}>Maximum
                <NumberInput allowDecimal={false} min={1} value={f.maxConsecutiveDays} onChange={(v) => set("maxConsecutiveDays", v ?? 1)} className={numCls} /> consecutive days
              </div>
            </Rule>
            <Rule on={f.maxMonthOn} onToggle={(v) => set("maxMonthOn", v)} title="Limit days per month" desc="Cap total days of this leave in a calendar month.">
              <div className={inlineBox}>Maximum
                <NumberInput allowDecimal={false} min={1} value={f.maxDaysPerMonth} onChange={(v) => set("maxDaysPerMonth", v ?? 1)} className={numCls} /> days per month
              </div>
            </Rule>
            <Rule on={f.applyCutoffOn} onToggle={(v) => set("applyCutoffOn", v)} title="Monthly application cut-off" desc="Stop accepting applications late in the month.">
              <div className={inlineBox}>Cannot apply after day
                <NumberInput allowDecimal={false} min={1} max={31} value={f.applyCutoffDay} onChange={(v) => set("applyCutoffDay", v ?? 1)} className={numCls} /> of every month
              </div>
            </Rule>
            <Rule on={f.minGapOn} onToggle={(v) => set("minGapOn", v)} title="Minimum gap between leaves" desc="Space out repeated instances of this leave.">
              <div className={inlineBox}>At least
                <NumberInput allowDecimal={false} min={0} value={f.minGapDays} onChange={(v) => set("minGapDays", v ?? 0)} className={numCls} /> days between two instances
              </div>
            </Rule>
            <Rule on={f.sandwichHoliday} onToggle={(v) => set("sandwichHoliday", v)} title="Sandwich holidays" desc="Holidays falling within/adjoining the leave are counted as leave." />
            <Rule on={f.sandwichWeekoff} onToggle={(v) => set("sandwichWeekoff", v)} title="Sandwich weekly-offs" desc="Weekly-offs falling within/adjoining the leave are counted as leave." />
            <Rule on={f.blockedDuringNotice} onToggle={(v) => set("blockedDuringNotice", v)} title="Block during notice period" desc="Employees serving notice cannot avail this leave." />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-gray-100">
        <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="px-4 py-2 border border-gray-200 rounded-lg text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">← Back</button>
        <span className="text-[12px] text-gray-400 font-medium hidden sm:block">{STEPS[step].label}</span>
        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="px-4 py-2 border border-green-200 text-green-700 rounded-lg text-[13px] font-semibold hover:bg-green-50 disabled:opacity-50">
            {saveMut.isPending ? "Saving…" : "Save"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-[13px] font-semibold hover:bg-green-700">Next →</button>
          ) : (
            <button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-[13px] font-semibold hover:bg-green-700 disabled:opacity-50">
              {saveMut.isPending ? "Saving…" : "Save rules"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
