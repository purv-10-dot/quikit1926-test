"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { ChevronLeft, Settings, Save, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";

type Kind =
  | "Bonus" | "Arrears" | "Incentive" | "Commission"
  | "PerformanceBonus" | "ReferralBonus" | "Other" | "Deduction";

interface Row {
  kind: Kind;
  taxable: boolean;
  considerForEPF: boolean;
  considerForESI: boolean;
  considerForPT: boolean;
  isCustom: boolean;
  updatedAt: string | null;
}

const KIND_LABEL: Record<Kind, string> = {
  Bonus: "Bonus",
  Arrears: "Arrears (deferred salary)",
  Incentive: "Incentive",
  Commission: "Commission",
  PerformanceBonus: "Performance Bonus",
  ReferralBonus: "Referral Bonus",
  Other: "Other Earning",
  Deduction: "Deduction (negative pay)",
};

const KIND_HINT: Record<Kind, string> = {
  Bonus: "Default: Taxable + ESI + PT. EPF excluded per Section 2(b) PF Act.",
  Arrears: "Default: all four apply. Arrears are deferred Basic, so EPF applies.",
  Incentive: "Variable pay outside basic — usually no EPF.",
  Commission: "Same as incentive.",
  PerformanceBonus: "Same as bonus.",
  ReferralBonus: "One-off, not regular wage — typically excluded from all statutory.",
  Other: "Safe defaults; review per case.",
  Deduction: "Flags don't apply — deduction is negative pay.",
};

const FLAG_COLS: { key: keyof Pick<Row, "taxable" | "considerForEPF" | "considerForESI" | "considerForPT">; label: string }[] = [
  { key: "taxable", label: "Taxable" },
  { key: "considerForEPF", label: "EPF" },
  { key: "considerForESI", label: "ESI" },
  { key: "considerForPT", label: "PT" },
];

export default function OneTimeDefaultsPage() {
  const api = useApiClient();
  const toast = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["one-time-defaults"],
    queryFn: () => api.get<Row[]>("/api/v1/hrms/payroll/one-time-earnings/defaults"),
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.data) {
      setRows(data.data);
      setDirty(false);
    }
  }, [data]);

  const toggle = (kind: Kind, key: keyof Row) => {
    setRows((prev) =>
      prev.map((r) => (r.kind === kind ? { ...r, [key]: !(r[key] as boolean) } : r)),
    );
    setDirty(true);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      api.put("/api/v1/hrms/payroll/one-time-earnings/defaults", {
        defaults: rows.map(({ kind, taxable, considerForEPF, considerForESI, considerForPT }) => ({
          kind, taxable, considerForEPF, considerForESI, considerForPT,
        })),
      }),
    onSuccess: () => {
      toast.success("Saved", "Defaults updated — every new one-time entry will use these flags.");
      setDirty(false);
      refetch();
    },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  return (
    <div className="space-y-4">
      <Link
        href="/payroll/one-time-earnings"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#3b82f6]"
      >
        <ChevronLeft size={14} /> Back to One-Time Pay &amp; Deductions
      </Link>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Settings className="text-[#3b82f6]" />
          <div>
            <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">
              Tax &amp; statutory defaults
            </h1>
            <p className="text-sm text-gray-500">
              Set tax / EPF / ESI / PT treatment <b>once per Kind</b>. Every new one-time entry will follow these rules automatically.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={() => { if (data?.data) { setRows(data.data); setDirty(false); } }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-md text-sm font-semibold"
            >
              <RotateCcw size={14} /> Discard
            </button>
          )}
          <button
            type="button"
            disabled={!dirty || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-50 text-white rounded-md text-sm font-semibold shadow-sm"
          >
            <Save size={14} /> {saveMut.isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonLine w="100%" h={20} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50/40">
                <th className="text-left py-2.5 px-3">Kind</th>
                {FLAG_COLS.map((c) => (
                  <th key={c.key} className="text-center py-2.5 px-3 w-24">{c.label}</th>
                ))}
                <th className="text-left py-2.5 px-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.kind} className="border-b border-gray-50 hover:bg-gray-50/40">
                  <td className="py-2.5 px-3">
                    <p className="font-semibold text-gray-900">{KIND_LABEL[r.kind]}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{KIND_HINT[r.kind]}</p>
                  </td>
                  {FLAG_COLS.map((c) => {
                    const checked = r[c.key];
                    return (
                      <td key={c.key} className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(r.kind, c.key)}
                          className={clsx(
                            "inline-flex items-center justify-center w-9 h-9 rounded-md border-2 transition",
                            checked
                              ? "bg-emerald-50 border-emerald-400 text-emerald-700 hover:bg-emerald-100"
                              : "bg-gray-50 border-gray-200 text-gray-300 hover:bg-gray-100 hover:border-gray-300",
                          )}
                          title={`Toggle ${c.label} for ${KIND_LABEL[r.kind]}`}
                        >
                          {checked ? "✓" : "—"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3">
                    <span className={clsx(
                      "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
                      r.isCustom ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : "bg-gray-50 text-gray-500 ring-1 ring-gray-200",
                    )}>
                      {r.isCustom ? "Custom" : "Default"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
        <b>Heads up:</b> Changes apply only to new one-time entries created after saving. Already-created entries keep their original flags. To re-flag historical entries, ask Engineering for a one-time normalization script.
      </div>
    </div>
  );
}
