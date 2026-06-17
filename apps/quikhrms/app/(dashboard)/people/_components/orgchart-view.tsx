"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { clsx } from "clsx";
import { GitBranch, Maximize2, Minus, Plus } from "lucide-react";

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  profilePhoto: string | null;
  jobTitle: string | null;
  reportingManagerId: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; title: string } | null;
  officeLocation: { id: string; name: string; city: string | null } | null;
}

interface Node {
  emp: Employee;
  children: Node[];
}

const DEPT_COLORS: Record<string, string> = {
  Engineering: "bg-blue-100 text-blue-700",
  Sales: "bg-emerald-100 text-emerald-700",
  Marketing: "bg-amber-100 text-amber-700",
  "Human Resources": "bg-pink-100 text-pink-700",
  Operations: "bg-violet-100 text-violet-700",
  Finance: "bg-cyan-100 text-cyan-700",
  Design: "bg-rose-100 text-rose-700",
  Support: "bg-indigo-100 text-indigo-700",
};

function deptColor(name: string | undefined | null): string {
  if (!name) return "bg-gray-100 text-gray-600";
  return DEPT_COLORS[name] ?? "bg-slate-100 text-slate-700";
}

export function OrgChartView() {
  const api = useApiClient();
  const [zoom, setZoom] = useState(100);
  const [layout, setLayout] = useState<"vertical" | "horizontal">("vertical");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["people", "orgchart"],
    queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=500"),
  });
  const employees = data?.data ?? [];

  const tree = useMemo(() => {
    const map = new Map<string, Node>();
    for (const e of employees) map.set(e.id, { emp: e, children: [] });
    const roots: Node[] = [];
    for (const e of employees) {
      const node = map.get(e.id);
      if (!node) continue;
      if (e.reportingManagerId && map.has(e.reportingManagerId)) {
        map.get(e.reportingManagerId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [employees]);

  return (
    <div className="surface-card relative overflow-hidden">
      {/* Top toolbar */}
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
        <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
          <GitBranch size={12} /> Total: <strong className="text-gray-900">{employees.length}</strong>
        </p>
        <button
          onClick={() => setLayout((l) => (l === "vertical" ? "horizontal" : "vertical"))}
          title="Toggle layout"
          className="btn btn-secondary btn-sm"
        >
          <Maximize2 size={12} /> {layout === "vertical" ? "Vertical" : "Horizontal"}
        </button>
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} className="overflow-auto p-8 bg-gradient-to-b from-gray-50/50 to-white" style={{ minHeight: "560px" }}>
        {isLoading ? (
          <div className="text-center text-sm text-gray-500 py-12">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="text-center text-sm text-gray-500 py-12">No employees.</div>
        ) : (
          <div
            className={clsx(
              "inline-block min-w-full transition-transform origin-top-left",
              layout === "vertical" ? "" : "",
            )}
            style={{ transform: `scale(${zoom / 100})` }}
          >
            <div className={clsx(
              "flex gap-12",
              layout === "vertical" ? "flex-col items-center" : "items-start",
            )}>
              {tree.map((root) => (
                <TreeBranch key={root.emp.id} node={root} layout={layout} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-5 left-5 inline-flex items-center bg-white border border-gray-200 rounded-full shadow-sm px-1 py-0.5 z-10">
        <button onClick={() => setZoom((z) => Math.max(40, z - 10))} className="p-1.5 rounded-full hover:bg-gray-100">
          <Minus size={12} />
        </button>
        <span className="text-xs font-semibold text-gray-700 px-2">{zoom}%</span>
        <button onClick={() => setZoom((z) => Math.min(160, z + 10))} className="p-1.5 rounded-full hover:bg-gray-100">
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

function TreeBranch({ node, layout }: { node: Node; layout: "vertical" | "horizontal" }) {
  const initials = `${node.emp.firstName[0] ?? ""}${node.emp.lastName[0] ?? ""}`.toUpperCase();
  const dept = node.emp.department?.name;
  const colorMap: Record<string, string> = {
    Engineering: "bg-blue-500",
    Sales: "bg-emerald-500",
    Marketing: "bg-amber-500",
    "Human Resources": "bg-pink-500",
    Operations: "bg-violet-500",
    Finance: "bg-cyan-500",
    Design: "bg-rose-500",
    Support: "bg-indigo-500",
  };
  const avatarColor = (dept && colorMap[dept]) ?? "bg-slate-500";

  return (
    <div className={clsx("flex", layout === "vertical" ? "flex-col items-center" : "items-start gap-8")}>
      {/* Card */}
      <Link href={`/employees/${node.emp.id}`} className="block w-52">
        <div className="surface-card p-4 text-center hover:border-[#3b82f6] hover:shadow-md transition group">
          {node.emp.profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.emp.profilePhoto} alt="" className="w-14 h-14 rounded-full object-cover mx-auto ring-2 ring-gray-100" />
          ) : (
            <div className={clsx("w-14 h-14 rounded-full mx-auto flex items-center justify-center text-white font-bold text-sm ring-2 ring-white shadow", avatarColor)}>
              {initials}
            </div>
          )}
          <p className="mt-2 font-bold text-sm text-gray-900 group-hover:text-[#3b82f6]">
            {node.emp.displayName ?? `${node.emp.firstName} ${node.emp.lastName}`}
          </p>
          <p className="text-[11px] text-gray-500 truncate">
            {node.emp.designation?.title ?? node.emp.jobTitle ?? "—"}
          </p>
          {(dept || node.emp.officeLocation?.city) && (
            <p className="text-[10px] text-gray-400 mt-1 truncate">
              {dept}{dept && node.emp.officeLocation?.city ? " · " : ""}{node.emp.officeLocation?.city ?? ""}
            </p>
          )}
          {dept && (
            <span className={clsx("inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", deptColor(dept))}>
              {dept}
            </span>
          )}
        </div>
      </Link>

      {/* Children */}
      {node.children.length > 0 && (
        <>
          {/* Connector */}
          <div className={clsx("bg-gray-200", layout === "vertical" ? "w-px h-6" : "w-6 h-px self-center")} />
          <div className={clsx(
            "flex gap-6",
            layout === "vertical" ? "flex-row items-start" : "flex-col items-start",
          )}>
            {node.children.map((c) => (
              <TreeBranch key={c.emp.id} node={c} layout={layout} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
