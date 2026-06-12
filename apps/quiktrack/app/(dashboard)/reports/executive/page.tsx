import { ExecutiveReport } from "@/components/reports/executive/executive-report";
import { RequirePerm } from "@/components/shell/require-perm";

export default function ExecutiveReportPage() {
  return (
    <RequirePerm resource="Report" action="view">
      <ExecutiveReport />
    </RequirePerm>
  );
}
