import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export function BalanceSheetReport() {
  return <ReportPage config={getReportConfig("balance-sheet")} />;
}
