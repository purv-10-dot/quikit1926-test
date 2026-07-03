import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export default function CashFlowPage() {
  return <ReportPage config={getReportConfig("cash-flow")} />;
}
