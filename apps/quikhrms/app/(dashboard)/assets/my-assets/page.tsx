"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Package, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { AssetTabs } from "../_components/asset-tabs";
import { PageHeader } from "@/components/hrms/ui/page-header";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface Assignment {
  id: string; status: string; assignedAt: string; expectedReturnDate: string | null; returnedAt: string | null;
  returnCondition: string | null; notes: string | null;
  asset: { id: string; assetCode: string; name: string; category: string; brand: string | null; model: string | null; serialNumber: string | null; status: string; condition: string; warrantyExpiry: string | null };
}

export default function MyAssetsPage() {
  const api = useApiClient();
  const { employee } = useDashboardConfig();
  const myEmployeeId = employee?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["assets", "my", myEmployeeId],
    queryFn: () => api.get<Assignment[]>(`/api/v1/hrms/assets/employee/${myEmployeeId}?includeHistory=true`),
    enabled: !!myEmployeeId,
  });

  const assignments = data?.data ?? [];
  const active = assignments.filter((a) => a.status === "AssignmentActive");
  const past = assignments.filter((a) => a.status !== "AssignmentActive");

  const overdue = active.filter((a) => a.expectedReturnDate && new Date(a.expectedReturnDate) < new Date());

  return (
    <div className="w-full px-6 py-6">
      <PageHeader
        icon={<Package size={28} className="text-[#3b82f6]" />}
        title="My assets"
        subtitle="Items currently assigned to you."
      />
      <div className="mb-5"><AssetTabs /></div>

      {overdue.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-800">
          <AlertTriangle size={16} /> {overdue.length} asset{overdue.length > 1 ? "s" : ""} overdue for return
        </div>
      )}

      {isLoading || !myEmployeeId ? <SkeletonTable rows={4} cols={4} /> : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">Active Assignments ({active.length})</div>
            {active.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">No active assets</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {active.map((a) => {
                  const isOverdue = a.expectedReturnDate && new Date(a.expectedReturnDate) < new Date();
                  return (
                    <Link key={a.id} href={`/assets/${a.asset.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                      <div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-gray-900">{a.asset.name}</span>
                          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{a.asset.assetCode}</span>
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{a.asset.category}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {a.asset.brand && <span>{a.asset.brand} {a.asset.model} • </span>}
                          {a.asset.serialNumber && <span className="font-mono">SN: {a.asset.serialNumber} • </span>}
                          <span>Assigned {new Date(a.assignedAt).toLocaleDateString("en-IN")}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        {a.expectedReturnDate ? (
                          <div className={clsx("text-xs", isOverdue ? "text-red-600 font-medium" : "text-gray-500")}>
                            {isOverdue && <AlertTriangle size={12} className="inline mr-1" />}
                            Return by {new Date(a.expectedReturnDate).toLocaleDateString("en-IN")}
                          </div>
                        ) : <div className="text-xs text-gray-400">No return date</div>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">History ({past.length})</div>
              <div className="divide-y divide-gray-100">
                {past.map((a) => (
                  <div key={a.id} className="px-4 py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="text-gray-900">{a.asset.name}</span>
                      <span className="ml-2 font-mono text-xs text-gray-500">{a.asset.assetCode}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{new Date(a.assignedAt).toLocaleDateString("en-IN")} → {a.returnedAt ? new Date(a.returnedAt).toLocaleDateString("en-IN") : "—"}</span>
                      <span className={clsx("px-2 py-0.5 rounded-full",
                        a.status === "AssignmentReturned" ? "bg-green-100 text-green-700" :
                        a.status === "AssignmentLost" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600")}>
                        {a.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
