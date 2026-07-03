import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function SalesOrdersPage() {
  return <ModulePage config={getModuleConfig("sales-orders")} />;
}
