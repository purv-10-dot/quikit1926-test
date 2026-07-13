import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export default function Gstr1Page() {
  return <ReportPage config={getReportConfig("gstr-1")} />;
}
