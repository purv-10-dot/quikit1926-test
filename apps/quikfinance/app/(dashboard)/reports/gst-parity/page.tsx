import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export default function GstParityPage() {
  return <ReportPage config={getReportConfig("gst-parity")} />;
}
