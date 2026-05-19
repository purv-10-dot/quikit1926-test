import { TimesheetView } from "@/components/timesheet/timesheet-view";
import { RequirePerm } from "@/components/shell/require-perm";

export default function GlobalTimesheetPage() {
  return (
    <RequirePerm resource="Timesheet" action="view">
      <div>
        <div className="px-6 pt-4">
          <h1 className="text-xl font-semibold text-gray-900">Timesheet</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            All projects across the tenant. Use the period switcher to drill into a week,
            month, or quarter.
          </p>
        </div>
        <TimesheetView groupBy="user-issue" />
      </div>
    </RequirePerm>
  );
}
