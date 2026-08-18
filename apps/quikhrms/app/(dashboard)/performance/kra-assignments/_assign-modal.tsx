"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Users, Search, Check, X, Briefcase, Building2 } from "lucide-react";
import { clsx } from "clsx";

interface Scorecard {
  id: string;
  name: string;
  designationId: string | null;
  departmentId: string | null;
}

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  profilePhoto: string | null;
  designation: { id?: string; title: string } | null;
  department: { id?: string; name: string } | null;
}

export function AssignKraModal({
  open,
  onClose,
  scorecard,
}: {
  open: boolean;
  onClose: () => void;
  scorecard: Scorecard | null;
}) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState("");
  const [empFilter, setEmpFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Both designation and department are locked to the scorecard — assignment
  // is scoped to the exact team this scorecard was built for. HR can't
  // accidentally assign to people outside that scope.
  const lockedDepartmentId = scorecard?.departmentId ?? "";
  const lockedDesignationId = scorecard?.designationId ?? "";

  // Reset on open/scorecard change.
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setEffectiveFrom(new Date().toISOString().slice(0, 10));
      setEffectiveTo("");
      setEmpFilter("");
    }
  }, [open, scorecard]);

  const { data: empData, isLoading } = useQuery({
    queryKey: ["assign-employees", lockedDesignationId, lockedDepartmentId],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "500", picker: "1" });
      if (lockedDesignationId) params.set("designationId", lockedDesignationId);
      if (lockedDepartmentId) params.set("departmentId", lockedDepartmentId);
      return api.get<Employee[]>(`/api/v1/hrms/employees?${params.toString()}`);
    },
    enabled: open,
  });
  const employees = empData?.data ?? [];

  // Fetch ALL existing assignments for this scorecard (any status). Two blocks:
  //  1. Active → can't have a second Active assignment for the same person.
  //  2. Same effectiveFrom collision → DB has @@unique on (employee, scorecard, effectiveFrom),
  //     so re-assigning with the same date would hit P2002 even for Cancelled/Completed.
  const { data: existingData } = useQuery({
    queryKey: ["existing-assignments-all", scorecard?.id],
    queryFn: () =>
      api.get<{ employeeId: string; status: "Active" | "Completed" | "Cancelled"; effectiveFrom: string }[]>(
        `/api/v1/hrms/performance/kra-assignments?scorecardId=${scorecard!.id}`,
      ),
    enabled: open && !!scorecard?.id,
  });
  const existing = existingData?.data ?? [];

  // Map empId → blocked status for the currently-selected effectiveFrom.
  // "Active" wins over date-collision; both flavors disable the row.
  const blockedByEmployee = new Map<string, { reason: "Active" | "Completed" | "Cancelled" }>();
  for (const e of existing) {
    const dateMatches = e.effectiveFrom.slice(0, 10) === effectiveFrom;
    if (e.status === "Active" || dateMatches) {
      // Active always wins (won't get overridden by a less-severe row)
      const prior = blockedByEmployee.get(e.employeeId);
      if (!prior || prior.reason !== "Active") {
        blockedByEmployee.set(e.employeeId, { reason: e.status });
      }
    }
  }

  const filteredEmployees = useMemo(() => {
    if (!empFilter.trim()) return employees;
    const q = empFilter.trim().toLowerCase();
    return employees.filter((e) =>
      e.firstName.toLowerCase().includes(q)
      || e.lastName.toLowerCase().includes(q)
      || e.employeeCode.toLowerCase().includes(q),
    );
  }, [employees, empFilter]);

  const toggle = (id: string) => {
    if (blockedByEmployee.has(id)) return; // can't re-select blocked
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => {
    setSelected((s) => {
      const next = new Set(s);
      filteredEmployees.forEach((e) => {
        if (!blockedByEmployee.has(e.id)) next.add(e.id);
      });
      return next;
    });
  };
  const clearAll = () => setSelected(new Set());

  const { data: desigsData } = useQuery({
    queryKey: ["designations-lite"],
    queryFn: () => api.get<{ id: string; title: string }[]>("/api/v1/hrms/designations?limit=300"),
    staleTime: 5 * 60_000,
    enabled: open && !!lockedDesignationId,
  });
  const lockedDesignationName = (desigsData?.data ?? []).find((d) => d.id === lockedDesignationId)?.title ?? null;

  const { data: deptsData } = useQuery({
    queryKey: ["departments-lite-kra"],
    queryFn: () => api.get<{ id: string; name: string }[]>("/api/v1/hrms/departments?limit=200"),
    staleTime: 5 * 60_000,
    enabled: open && !!lockedDepartmentId,
  });
  const lockedDepartmentName = (deptsData?.data ?? []).find((d) => d.id === lockedDepartmentId)?.name ?? null;

  const assignMut = useMutation({
    mutationFn: () => api.post<{ created: number; skippedDuplicates: number }>(
      "/api/v1/hrms/performance/kra-assignments",
      {
        scorecardId: scorecard!.id,
        employeeIds: [...selected],
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      },
    ),
    onSuccess: (res) => {
      const { created, skippedDuplicates } = res.data;
      qc.invalidateQueries({ queryKey: ["performance", "kra-assignments"] });
      qc.invalidateQueries({ queryKey: ["performance", "kra-templates"] });
      let msg = `${created} assigned`;
      if (skippedDuplicates) msg += ` · ${skippedDuplicates} already assigned for this period`;
      toast.success("Done", msg);
      onClose();
    },
  });

  const canSubmit = !!scorecard && selected.size > 0 && !!effectiveFrom && !assignMut.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign scorecard to employees"
      subtitle={scorecard ? `"${scorecard.name}"` : ""}
      headerIcon={<Users size={20} />}
      size="2xl"
      bodyClassName="overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        {/* Effective period */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Effective from <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Effective to <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={effectiveTo}
              min={effectiveFrom || undefined}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Selected</label>
            <div className="px-3 py-2 rounded-md ring-1 ring-gray-200 bg-gray-50 text-xs font-bold tabular-nums">
              {selected.size}{" "}
              <span className="text-gray-400 font-normal">
                of {filteredEmployees.length} visible
              </span>
            </div>
          </div>
        </div>

        {/* Scope — locked to the scorecard's department + designation */}
        {(lockedDepartmentId || lockedDesignationId) ? (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-green-50/60 border border-green-100 text-xs text-green-900">
            <Building2 size={13} className="text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              Showing employees matching this scorecard&apos;s scope:
              <div className="mt-1 flex flex-wrap gap-1.5">
                {lockedDepartmentName && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white ring-1 ring-green-200 text-green-800 font-semibold">
                    <Building2 size={10} /> {lockedDepartmentName}
                  </span>
                )}
                {lockedDesignationName && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white ring-1 ring-green-200 text-green-800 font-semibold">
                    <Briefcase size={10} /> {lockedDesignationName}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50/60 border border-amber-200 text-xs text-amber-900">
            <Building2 size={13} className="text-amber-600 shrink-0" />
            <span>
              This scorecard isn&apos;t tied to a department or designation — all employees are shown. Edit the scorecard to scope it.
            </span>
          </div>
        )}

        {/* Search only — designation + department dropdowns removed; both locked above */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={empFilter}
            onChange={(e) => setEmpFilter(e.target.value)}
            placeholder="Search by name or employee code"
            className={inputCls + " pl-8"}
          />
        </div>

        {/* Bulk actions */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllVisible}
              className="px-2 py-1 rounded text-xs font-semibold text-[#166534] hover:bg-[#166534]/10"
            >
              Select all visible
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-2 py-1 rounded text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Employee list */}
        <div className="rounded-xl ring-1 ring-gray-200 bg-white max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-gray-500">Loading…</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-500">No employees match these filters.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredEmployees.map((e) => {
                const blocked = blockedByEmployee.get(e.id);
                const isAssigned = !!blocked;
                const checked = selected.has(e.id);
                const initials = `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase();
                return (
                  <li key={e.id}>
                    <label
                      className={clsx(
                        "flex items-center gap-3 px-4 py-2.5 transition",
                        isAssigned
                          ? "bg-gray-50/80 cursor-not-allowed opacity-60"
                          : checked
                            ? "bg-green-50/60 cursor-pointer"
                            : "hover:bg-gray-50 cursor-pointer",
                      )}
                      title={
                        blocked?.reason === "Active"
                          ? "Already has an active assignment for this scorecard"
                          : blocked
                            ? `Was assigned on this date (status: ${blocked.reason}). Pick a different effective-from date to re-assign.`
                            : ""
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isAssigned}
                        onChange={() => toggle(e.id)}
                        className="rounded text-green-600 disabled:cursor-not-allowed"
                      />
                      {e.profilePhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.profilePhoto} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white flex items-center justify-center text-xs font-bold">
                          {initials}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 truncate flex items-center gap-2">
                          <span>
                            {e.firstName} {e.lastName}
                            <span className="ml-2 font-mono text-[11px] text-gray-400">{e.employeeCode}</span>
                          </span>
                          {blocked && (
                            <span className={clsx(
                              "inline-flex items-center px-1.5 py-0.5 rounded-full ring-1 text-[11px] font-medium uppercase tracking-wide",
                              blocked.reason === "Active" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
                              blocked.reason === "Completed" && "bg-green-50 text-green-700 ring-green-200",
                              blocked.reason === "Cancelled" && "bg-gray-100 text-gray-600 ring-gray-200",
                            )}>
                              {blocked.reason === "Active" ? "Already assigned" : `${blocked.reason} on this date`}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate flex items-center gap-2">
                          {e.designation?.title && (
                            <span className="inline-flex items-center gap-1"><Briefcase size={9} /> {e.designation.title}</span>
                          )}
                          {e.department?.name && (
                            <span className="inline-flex items-center gap-1"><Building2 size={9} /> {e.department.name}</span>
                          )}
                        </p>
                      </div>
                      {checked && !isAssigned && <Check size={14} className="text-green-600" />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/60">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 border border-gray-300 bg-white rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <X size={13} className="inline mr-1" /> Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => assignMut.mutate()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium"
        >
          {assignMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          Assign {selected.size} {selected.size === 1 ? "employee" : "employees"}
        </button>
      </div>
    </Modal>
  );
}

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534]";
