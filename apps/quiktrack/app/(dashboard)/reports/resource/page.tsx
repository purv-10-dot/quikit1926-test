import { ResourceReport } from "@/components/reports/resource-report";
import { RequirePerm } from "@/components/shell/require-perm";

export default function ResourceReportPage() {
  return (
    <RequirePerm adminOnly>
      <ResourceReport />
    </RequirePerm>
  );
}
