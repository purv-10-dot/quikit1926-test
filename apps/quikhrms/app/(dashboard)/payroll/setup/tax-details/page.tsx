"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { Save, CheckCircle2, ShieldCheck, IdCard, User, Users, MapPin, AlertCircle, Briefcase } from "lucide-react";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/ui/select";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { PAN_PATTERN, ID_TITLES } from "@/lib/validations/identifiers";

interface TaxDetails {
  pan: string | null;
  tan: string | null;
  tdsCircleCodeArea: string | null;
  tdsCircleCodeType: string | null;
  tdsCircleNumber: string | null;
  tdsCircleSubNumber: string | null;
  taxPaymentFrequency: "Monthly" | "Quarterly";
  deductorType: "Employee" | "NonEmployee";
  deductorEmployeeId: string | null;
  deductorName: string | null;
  deductorFatherName: string | null;
  deductorAddress: string | null;
  deductorDesignation: string | null;
}

const inputBase =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 " +
  "focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534] transition";
const inputUpper = clsx(inputBase, "font-mono tracking-wider uppercase");

export default function TaxDetailsPage() {
  return (
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <TaxDetailsPageInner />
    </Suspense>
  );
}

function TaxDetailsPageInner() {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/payroll/setup";

  const { data } = useQuery({
    queryKey: ["payroll", "tax-details"],
    queryFn: () => api.get<TaxDetails | null>("/api/v1/hrms/payroll/tax-details"),
  });

  const { data: employeesRes } = useQuery({
    queryKey: ["employees", "deductor-list"],
    queryFn: () =>
      api.get<Array<{ id: string; firstName: string; lastName: string; employeeCode: string }>>(
        "/api/v1/hrms/employees?limit=500",
      ),
  });
  const employeeList = employeesRes?.data ?? [];

  const [form, setForm] = useState<Partial<TaxDetails>>({
    taxPaymentFrequency: "Monthly",
    deductorType: "Employee",
  });
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.data) setForm({ ...data.data });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (body: Partial<TaxDetails>) => api.put("/api/v1/hrms/payroll/tax-details", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      setErr(null);
      setFieldErrors({});
      setSaved(true);
      setTimeout(() => router.push(returnTo.startsWith("/") ? returnTo : "/payroll/setup"), 800);
    },
    meta: { suppressGlobalError: true },
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

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Breadcrumb */}
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#166534] to-[#16a34a] text-white px-5 py-4 shadow-sm flex items-start gap-4 mb-5">
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h1 className="font-serif-display text-base font-semibold leading-tight">Tax Details</h1>
          <p className="text-xs text-white/75 mt-1">
            Authorized signatory + PAN used on Form 16, Form 24Q and TDS challans.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate({
            pan: form.pan?.trim().toUpperCase() || null,
            deductorType: form.deductorType,
            deductorEmployeeId: form.deductorEmployeeId || null,
            deductorName: form.deductorName || null,
            deductorFatherName: form.deductorFatherName || null,
            deductorAddress: form.deductorAddress?.trim() || null,
            deductorDesignation: form.deductorDesignation?.trim() || null,
          });
        }}
        className="space-y-4"
      >
        {/* Authorized Signatory */}
        <Card icon={<User size={16} />} title="Authorized Signatory" subtitle="Person who signs payroll-tax filings on behalf of the company.">
          {/* Type toggle */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-700 mb-2">Signatory type</p>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              {(
                [
                  { v: "Employee", label: "Employee", icon: <Users size={13} /> },
                  { v: "NonEmployee", label: "Non-Employee", icon: <User size={13} /> },
                ] as const
              ).map((opt) => {
                const active = form.deductorType === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, deductorType: opt.v, deductorEmployeeId: null, deductorName: "" })
                    }
                    className={clsx(
                      "inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold rounded-md transition",
                      active ? "bg-white text-[#166534] shadow-sm" : "text-gray-500 hover:text-gray-700",
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Signatory Name" required>
              {form.deductorType === "Employee" ? (
                <Select
                  value={form.deductorEmployeeId ?? ""}
                  onChange={(v) => {
                    const emp = employeeList.find((e) => e.id === v);
                    setForm({
                      ...form,
                      deductorEmployeeId: v,
                      deductorName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : "",
                    });
                  }}
                  options={employeeList.map((e) => ({
                    value: e.id,
                    label: `${e.firstName} ${e.lastName} (${e.employeeCode})`,
                  }))}
                  placeholder="Search and select an employee"
                  searchable
                />
              ) : (
                <input
                  type="text"
                  placeholder="Enter signatory name"
                  value={form.deductorName ?? ""}
                  onChange={(e) => setForm({ ...form, deductorName: e.target.value })}
                  required
                  className={inputBase}
                />
              )}
            </Field>

            <Field label="Father's Name" required>
              <input
                type="text"
                placeholder="As per PAN"
                value={form.deductorFatherName ?? ""}
                onChange={(e) => setForm({ ...form, deductorFatherName: e.target.value })}
                required
                className={inputBase}
              />
            </Field>

            <Field label="Authorized Signatory PAN" required icon={<IdCard size={13} />}>
              <input
                type="text"
                placeholder="ABCDE1234F"
                value={form.pan ?? ""}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                required
                maxLength={10}
                pattern={PAN_PATTERN}
                title={ID_TITLES.pan}
                className={inputUpper}
              />
              <Hint>5 letters + 4 digits + 1 letter (10 chars).</Hint>
            </Field>

            <Field label="Designation" required icon={<Briefcase size={13} />}>
              <input
                type="text"
                placeholder="e.g. Director, CFO, HR Head"
                value={form.deductorDesignation ?? ""}
                onChange={(e) => setForm({ ...form, deductorDesignation: e.target.value })}
                required
                className={inputBase}
              />
            </Field>

            <Field label="Address" required icon={<MapPin size={13} />} className="col-span-2">
              <textarea
                value={form.deductorAddress ?? ""}
                onChange={(e) => setForm({ ...form, deductorAddress: e.target.value })}
                required
                rows={3}
                placeholder="Full address of the authorized signatory"
                className={inputBase}
              />
            </Field>
          </div>
        </Card>

        {/* Status messages */}
        {saved && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
            <CheckCircle2 size={16} /> Tax details saved successfully — redirecting…
          </div>
        )}
        {err && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle size={16} /> {err}
            </div>
            {Object.entries(fieldErrors).length > 0 && (
              <ul className="list-disc list-inside text-xs mt-1.5 space-y-0.5">
                {Object.entries(fieldErrors).map(([field, msgs]) => (
                  <li key={field}>
                    <strong>{field}:</strong> {msgs.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Sticky save bar */}
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3">
          <p className="text-xs text-gray-500">
            <span className="text-red-500">*</span> indicates mandatory fields.
          </p>
          <div className="flex items-center gap-2">
            <Link
              href="/payroll/setup"
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium shadow-sm"
            >
              <Save size={13} /> {saveMut.isPending ? "Saving…" : "Save"}
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
      <div className="flex items-start gap-3 px-4 py-4 border-b border-gray-100">
        <div className="w-9 h-9 rounded-lg bg-[#166534]/5 text-[#166534] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-[13px] font-semibold text-gray-900 leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label, required, icon, children, className,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
        {icon && <span className="text-gray-400">{icon}</span>}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-gray-500 mt-1">{children}</p>;
}
