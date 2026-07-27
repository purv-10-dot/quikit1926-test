"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { Select } from "@/components/hrms/ui/select";
import {
  Plus, Target, Search, Edit2, Trash2, Users, Briefcase, Tag, Power, UserPlus,
} from "lucide-react";
import { AssignKraModal } from "../kra-assignments/_assign-modal";
import { clsx } from "clsx";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

interface Designation { id: string; title: string }
interface Department { id: string; name: string }

interface Scorecard {
  id: string;
  name: string;
  description: string | null;
  designationId: string | null;
  departmentId: string | null;
  tags: string[] | null;
  effectiveFrom: string;
  isActive: boolean;
  kras: {
    id: string;
    title: string;
    weight: string | number;
    kpis: { id: string; title: string; weight: string | number }[];
  }[];
  _count: { assignments: number };
  activeAssignmentCount: number;
  terminalAssignmentCount: number;
  canDelete: boolean;
}

export default function KraTemplatesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const [search, setSearch] = useState("");
  const [filterDesignation, setFilterDesignation] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Scorecard | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["performance", "kra-templates", filterDesignation, showInactive],
    queryFn: () => api.get<Scorecard[]>(
      `/api/v1/hrms/performance/kra-templates?${filterDesignation ? `designationId=${filterDesignation}&` : ""}${showInactive ? "includeInactive=true" : ""}`,
    ),
  });

  const { data: desigData } = useQuery({
    queryKey: ["designations-lite"],
    queryFn: () => api.get<Designation[]>("/api/v1/hrms/designations?limit=300"),
    staleTime: 5 * 60_000,
  });
  const designations = desigData?.data ?? [];

  const { data: deptData } = useQuery({
    queryKey: ["departments-lite-kra"],
    queryFn: () => api.get<Department[]>("/api/v1/hrms/departments?limit=200"),
    staleTime: 5 * 60_000,
  });
  const departments = deptData?.data ?? [];
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));
  const desigMap = new Map(designations.map((d) => [d.id, d.title]));

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/performance/kra-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance", "kra-templates"] });
      toast.success("Scorecard deleted");
    },
  });

  const scorecards = (data?.data ?? []).filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="w-full space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Target size={28} className="text-[#22c55e]" />
          <div>
            <h1 className="text-page-title text-gray-900">Scorecard Templates</h1>
            <p className="text-xs text-gray-500">
              Designation-wise scorecards. Weights validated. Assign to employees to start tracking.
            </p>
          </div>
        </div>
        <Link
          href="/performance/kra-templates/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm"
        >
          <Plus size={13} /> New scorecard
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scorecards…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534]"
          />
        </div>
        <div className="w-56">
          <Select
            value={filterDesignation}
            onChange={setFilterDesignation}
            placeholder="All designations"
            options={[
              { value: "", label: "All designations" },
              ...designations.map((d) => ({ value: d.id, label: d.title })),
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>
      </div>

      {/* Cards */}
      {isLoading ? (
        <SkeletonCards count={3} />
      ) : scorecards.length === 0 ? (
        <div className="rounded-2xl ring-1 ring-dashed ring-gray-300 bg-white p-12 text-center">
          <Target size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-[13px] font-semibold text-gray-900">No scorecards yet</p>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Create your first KRA/KPI scorecard for a designation.
          </p>
          <Link
            href="/performance/kra-templates/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium"
          >
            <Plus size={13} /> New scorecard
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scorecards.map((sc) => {
            const kraCount = sc.kras.length;
            const kpiCount = sc.kras.reduce((s, k) => s + k.kpis.length, 0);
            return (
              <div
                key={sc.id}
                className={clsx(
                  "rounded-xl bg-white ring-1 transition hover:shadow-md group",
                  sc.isActive ? "ring-gray-200" : "ring-gray-200 opacity-70",
                )}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/performance/kra-templates/${sc.id}`}
                        className="block"
                      >
                        <h3 className="font-serif-display text-[13px] font-semibold text-gray-900 leading-tight hover:text-[#22c55e] transition truncate">
                          {sc.name}
                        </h3>
                      </Link>
                      {sc.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{sc.description}</p>
                      )}
                    </div>
                    {!sc.isActive && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">
                        <Power size={9} /> Inactive
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {sc.designationId && desigMap.get(sc.designationId) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 ring-1 ring-green-100 text-[11px] font-semibold">
                        <Briefcase size={10} /> {desigMap.get(sc.designationId)}
                      </span>
                    )}
                    {sc.departmentId && deptMap.get(sc.departmentId) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 ring-1 ring-purple-100 text-[11px] font-semibold">
                        {deptMap.get(sc.departmentId)}
                      </span>
                    )}
                    {(sc.tags ?? []).slice(0, 3).map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-semibold">
                        <Tag size={9} /> {t}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-gray-500">
                      <span><span className="font-bold text-gray-900">{kraCount}</span> KRAs</span>
                      <span><span className="font-bold text-gray-900">{kpiCount}</span> KPIs</span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={11} /> <span className="font-bold text-gray-900">{sc._count.assignments}</span>
                      </span>
                    </div>
                    <span className="text-gray-400 text-[11px]">
                      eff. {new Date(sc.effectiveFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setAssignTarget(sc)}
                      disabled={!sc.isActive}
                      title={sc.isActive ? "Assign to employees" : "Activate the scorecard first to assign"}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <UserPlus size={12} /> Assign
                    </button>
                    <Link
                      href={`/performance/kra-templates/${sc.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal text-[#166534] hover:bg-[#166534]/10"
                    >
                      <Edit2 size={12} /> Edit
                    </Link>
                    <button
                      type="button"
                      disabled={!sc.canDelete}
                      title={
                        !sc.canDelete
                          ? `Cannot delete — ${sc.activeAssignmentCount} assignment${sc.activeAssignmentCount === 1 ? "" : "s"} still Active. Complete or cancel ${sc.activeAssignmentCount === 1 ? "it" : "them"} first.`
                          : sc.terminalAssignmentCount > 0
                            ? `Delete this scorecard (${sc.terminalAssignmentCount} completed/cancelled assignment${sc.terminalAssignmentCount === 1 ? "" : "s"} will be kept for audit)`
                            : "Delete this scorecard"
                      }
                      onClick={async () => {
                        if (!sc.canDelete) return;
                        const ok = await dialog.confirm({
                          title: `Delete "${sc.name}"?`,
                          description: sc.terminalAssignmentCount > 0
                            ? `This soft-deletes the template. ${sc.terminalAssignmentCount} historical assignment${sc.terminalAssignmentCount === 1 ? "" : "s"} (Completed/Cancelled) will stay on record for audit.`
                            : "This soft-deletes the template. No employees are affected.",
                          variant: "danger",
                          confirmLabel: "Delete",
                        });
                        if (ok) deleteMut.mutate(sc.id);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AssignKraModal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        scorecard={assignTarget}
      />
    </div>
  );
}
