import { ReportsView } from "@/components/reports/reports-view";
import { RequirePerm } from "@/components/shell/require-perm";

export default function ReportsPage() {
  return (
    <RequirePerm resource="Report" action="view">
      <ReportsView />
    </RequirePerm>
  );
}
