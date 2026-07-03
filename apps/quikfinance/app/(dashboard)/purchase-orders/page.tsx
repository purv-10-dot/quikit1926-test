import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function PurchaseOrdersPage() {
  return <ModulePage config={getModuleConfig("purchase-orders")} />;
}
