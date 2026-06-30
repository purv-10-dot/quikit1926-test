import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function CustomersPage() {
  return <ModulePage config={getModuleConfig("customers")} />;
}
