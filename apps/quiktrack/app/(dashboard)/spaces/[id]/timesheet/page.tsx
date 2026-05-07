import { TimesheetView } from "@/components/timesheet/timesheet-view";

export default function ProjectTimesheetPage({ params }: { params: { id: string } }) {
  return <TimesheetView projectId={params.id} groupBy="issue" />;
}
