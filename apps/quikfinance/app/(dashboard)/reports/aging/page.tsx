import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export default function AgingPage() {
  return <ReportPage config={getReportConfig("aging")} />;
}
