"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { clsx } from "clsx";

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  profilePhoto: string | null;
  jobTitle: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; title: string } | null;
  officeLocation: { id: string; name: string; city: string | null } | null;
}

type Attr = "department" | "age" | "gender" | "city" | "designation" | "site";

const ATTRS: { key: Attr; label: string }[] = [
  { key: "department", label: "Department" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "city", label: "City" },
  { key: "designation", label: "Designation" },
  { key: "site", label: "Site" },
];

function ageBucket(dob: string | null): string {
  if (!dob) return "Unknown";
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000));
  if (years < 25) return "<25";
  if (years < 35) return "25-34";
  if (years < 45) return "35-44";
  if (years < 55) return "45-54";
  return "55+";
}

function bucketKey(e: Employee, attr: Attr): string {
  switch (attr) {
    case "department": return e.department?.name ?? "Unassigned";
    case "designation": return e.designation?.title ?? e.jobTitle ?? "Unassigned";
    case "site": return e.officeLocation?.name ?? "Unassigned";
    case "city": return e.officeLocation?.city ?? "Unassigned";
    case "gender": return e.gender ?? "Unspecified";
    case "age": return ageBucket(e.dateOfBirth);
  }
}

const COL_GRADIENTS = [
  "from-blue-500 to-blue-700",
  "from-emerald-500 to-emerald-700",
  "from-amber-500 to-amber-700",
  "from-pink-500 to-pink-700",
  "from-violet-500 to-violet-700",
  "from-cyan-500 to-cyan-700",
  "from-rose-500 to-rose-700",
  "from-slate-700 to-slate-900",
];

export function ClubView() {
  const api = useApiClient();
  const [attr, setAttr] = useState<Attr>("department");

  const { data, isLoading } = useQuery({
    queryKey: ["people", "club"],
    queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=500"),
  });
  const employees = data?.data ?? [];
  const total = employees.length;

  const groups = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of employees) {
      const k = bucketKey(e, attr);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length);
  }, [employees, attr]);

  return (
    <div className="space-y-4">
      <div className="surface-card p-6">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">No employees.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex gap-6 min-h-[420px] pb-3" style={{ minWidth: groups.length * 180 + "px" }}>
              {groups.map(([groupName, list], idx) => {
                const pct = total > 0 ? Math.round((list.length / total) * 100) : 0;
                const gradient = COL_GRADIENTS[idx % COL_GRADIENTS.length];
                const initials = list
                  .slice(0, 12)
                  .map((e) => `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase());
                const overflow = Math.max(0, list.length - 12);
                return (
                  <div key={groupName} className="flex-1 min-w-[160px] flex flex-col items-center">
                    {/* Stack of avatars */}
                    <div className="flex flex-col-reverse items-center gap-1.5 mb-3">
                      {overflow > 0 && (
                        <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold bg-gradient-to-br", gradient)}>
                          +{overflow}
                        </div>
                      )}
                      {initials.map((init, i) => (
                        <Avatar key={i} init={init} emp={list[i]} />
                      ))}
                    </div>
                    {/* Label */}
                    <p className="font-bold text-xs text-gray-700 uppercase tracking-wide text-center">{groupName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{pct}% ({list.length})</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Attribute selector */}
      <div className="surface-card px-5 py-3">
        <div className="flex items-center gap-6 flex-wrap">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Group by</span>
          {ATTRS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAttr(a.key)}
              className={clsx(
                "text-xs uppercase tracking-wide font-bold pb-1.5 border-b-2 transition",
                attr === a.key ? "text-[#3b82f6] border-[#3b82f6]" : "text-gray-500 border-transparent hover:text-gray-900",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Avatar({ init, emp }: { init: string; emp: Employee }) {
  if (emp.profilePhoto) {
    return (
      <Link href={`/employees/${emp.id}`} title={`${emp.firstName} ${emp.lastName}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={emp.profilePhoto} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow hover:ring-[#3b82f6] transition" />
      </Link>
    );
  }
  return (
    <Link
      href={`/employees/${emp.id}`}
      title={`${emp.firstName} ${emp.lastName}`}
      className="w-9 h-9 rounded-full bg-gray-300 ring-2 ring-white shadow flex items-center justify-center text-[10px] font-bold text-gray-700 hover:ring-[#3b82f6] hover:bg-gray-400 transition"
    >
      {init}
    </Link>
  );
}
