import { ReportPage } from "@/components/shared/ReportPage";
import { getReportConfig } from "@/lib/reports";

export default function BalanceSheetPage() {
  return <ReportPage config={getReportConfig("balance-sheet")} />;
}
