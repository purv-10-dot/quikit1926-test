import { TimesheetView } from "@/components/timesheet/timesheet-view";

export default function GlobalTimesheetPage() {
  return (
    <div>
      <div className="px-6 pt-4">
        <h1 className="text-xl font-semibold text-gray-900">Timesheet</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          All projects across the tenant. Use the period switcher to drill into a week,
          month, or quarter.
        </p>
      </div>
      <TimesheetView groupBy="issue" />
    </div>
  );
}
