import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function InvoicesPage() {
  return <ModulePage config={getModuleConfig("invoices")} />;
}
