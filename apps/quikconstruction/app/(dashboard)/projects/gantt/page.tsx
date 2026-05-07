"use client";

import { useState } from "react";
import { GanttChart } from "lucide-react";
import { PageHeader, PageContainer, EmptyState } from "@/components/PageShell";
import { SelectInput } from "@/components/FormDrawer";
import { useProjects } from "@/hooks/use-masters";
import { useWorkOrders } from "@/hooks/use-projects";

export default function GanttPage() {
  const [selectedProject, setSelectedProject] = useState("");
  const { data: projects } = useProjects();
  const { data: result, isLoading } = useWorkOrders({
    projectId: selectedProject || undefined,
    status: "all",
  });
  const workOrders = result?.data ?? [];

  return (
    <>
      <PageHeader
        title="Gantt View"
        subtitle="Planned vs actual timeline for work orders and milestones"
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Gantt" }]}
      />
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <div className="min-w-[240px]">
          <SelectInput
            value={selectedProject}
            onChange={setSelectedProject}
            placeholder="Select Project..."
            options={(projects?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
          />
        </div>
      </div>
      <PageContainer>
        {!selectedProject ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16">
            <EmptyState title="Select a project" description="Choose a project to view the Gantt timeline."
              icon={<GanttChart className="w-8 h-8" />} />
          </div>
        ) : isLoading ? (
          <div className="p-8 animate-pulse space-y-3">
            {[1,2,3,4].map((i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        ) : workOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16">
            <EmptyState title="No timeline data"
              description="Create work orders with start and end dates to see the Gantt chart."
              icon={<GanttChart className="w-8 h-8" />} />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase min-w-[200px]">Work Order</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase">Contractor</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase">Start</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase">End</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase min-w-[300px]">Timeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {workOrders.map((wo: any) => {
                    const start = new Date(wo.startDate);
                    const end = new Date(wo.endDate);
                    const now = new Date();
                    const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                    const elapsed = Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                    const progress = Math.min(100, (elapsed / totalDays) * 100);

                    return (
                      <tr key={wo.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{wo.woNumber}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[180px]">{wo.title}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{wo.contractorName}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{wo.startDate}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{wo.endDate}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${wo.status === "completed" ? "bg-green-50 text-green-700 border-green-200" : wo.status === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>{wo.status?.replace(/_/g, " ")}</span></td>
                        <td className="px-4 py-3">
                          <div className="w-full bg-gray-100 rounded-full h-4 relative">
                            <div className="bg-orange-500 h-4 rounded-full transition-all" style={{ width: `${progress}%` }} />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-700">{Math.round(progress)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}
