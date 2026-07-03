import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export default function TrialBalancePage() {
  return <ReportPage config={getReportConfig("trial-balance")} />;
}
