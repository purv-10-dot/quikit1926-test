import { TimesheetTabs } from "./_components/timesheet-tabs";
import { RequirePerm } from "@/components/shell/require-perm";

export default function GlobalTimesheetPage() {
  return (
    <RequirePerm adminOnly>
      <div>
        <div className="px-6 pt-4">
          <h1 className="text-xl font-semibold text-gray-900">Timesheet</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            All projects across the tenant. Switch between Standard (hours per task)
            and Attendance (daily totals per member, colour-coded by status).
          </p>
        </div>
        <TimesheetTabs />
      </div>
    </RequirePerm>
  );
}
