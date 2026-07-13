import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export default function OutstandingPage() {
  return <ReportPage config={getReportConfig("outstanding")} />;
}
