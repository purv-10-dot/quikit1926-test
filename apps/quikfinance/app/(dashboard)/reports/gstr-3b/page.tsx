import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export default function Gstr3bPage() {
  return <ReportPage config={getReportConfig("gstr-3b")} />;
}
