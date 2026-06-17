"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { FileStack, ChevronLeft, Users, Trash2, Star, Plus } from "lucide-react";
import { useDialog } from "@/components/hrms/dialog";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface SalaryStructure {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  ctcMin: string | number | null;
  ctcMax: string | number | null;
  components: { id: string; component: { name: string; type: string } }[];
  _count: { employeeSalaries: number };
}

export default function SalaryTemplatesListPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "salary-templates"],
    queryFn: () => api.get<SalaryStructure[]>("/api/v1/hrms/payroll/salary-templates"),
    staleTime: 5 * 60_000,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/payroll/salary-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "salary-templates"] }),
  });

  const list = data?.data ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Link href="/payroll/setup" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#3b82f6]">
        <ChevronLeft size={14} /> Back to Payroll Setup
      </Link>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileStack size={18} className="text-[#3b82f6]" />
            <h1 className="text-lg font-bold text-gray-900">Salary Templates</h1>
          </div>
          <Link href="/payroll/setup/salary-templates/new" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-md text-xs font-semibold shadow-sm">
            <Plus size={14} /> Add New Template
          </Link>
        </div>

        <div className="p-5">
          {isLoading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : list.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-600">No salary templates yet.</p>
              <p className="text-xs text-gray-500 mt-1">Create a template to quickly apply salary structures to employees.</p>
              <Link href="/payroll/setup/salary-templates/new" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-md text-sm font-semibold shadow-sm">
                <Plus size={14} /> Create Template
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <th className="text-left py-2 px-3">Name</th>
                    <th className="text-left py-2 px-3">Code</th>
                    <th className="text-left py-2 px-3">Components</th>
                    <th className="text-left py-2 px-3">Assigned</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <Link href={`/payroll/setup/salary-templates/${r.id}`} className="text-[#3b82f6] font-medium hover:underline flex items-center gap-1.5">
                          {r.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}
                          {r.name}
                        </Link>
                        {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-gray-700">{r.code}</td>
                      <td className="py-3 px-3 text-gray-700">{r.components.length}</td>
                      <td className="py-3 px-3 text-gray-700">
                        <span className="inline-flex items-center gap-1"><Users size={12} /> {r._count.employeeSalaries}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={r.isActive ? "text-emerald-600 font-semibold" : "text-gray-400 font-medium"}>
                          {r.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={async () => {
                            const ok = await dialog.confirm({
                              title: `Delete template "${r.name}"?`,
                              description: "This salary template will be permanently removed.",
                              variant: "danger",
                              confirmLabel: "Delete",
                            });
                            if (ok) delMut.mutate(r.id);
                          }}
                          disabled={r.isActive || r._count.employeeSalaries > 0}
                          className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={r.isActive ? "Deactivate template before deleting" : r._count.employeeSalaries > 0 ? "Template is assigned to employees" : "Delete"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
