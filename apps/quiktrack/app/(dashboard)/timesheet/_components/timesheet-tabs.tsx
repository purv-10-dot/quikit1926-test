"use client";

import { useState } from "react";
import { TimesheetView } from "@/components/timesheet/timesheet-view";
import { AttendanceMatrix } from "@/components/timesheet/attendance-matrix";

type View = "standard" | "attendance";

const TABS: { value: View; label: string; hint: string }[] = [
  { value: "standard",   label: "Standard",   hint: "Hours per task / project" },
  { value: "attendance", label: "Attendance", hint: "Daily totals, status colours" },
];

export function TimesheetTabs() {
  const [view, setView] = useState<View>("standard");
  return (
    <div>
      <div className="px-6 pt-3 border-b border-gray-200">
        <div className="flex items-center gap-6">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setView(t.value)}
              className={`relative pb-2 text-sm font-medium ${
                view === t.value ? "text-blue-700" : "text-gray-600 hover:text-gray-900"
              }`}
              title={t.hint}
            >
              {t.label}
              {view === t.value && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-blue-600 rounded" />
              )}
            </button>
          ))}
        </div>
      </div>
      {view === "standard" ? <TimesheetView groupBy="user-issue" /> : <AttendanceMatrix />}
    </div>
  );
}
