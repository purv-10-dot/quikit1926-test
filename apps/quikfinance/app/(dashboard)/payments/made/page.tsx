import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function PaymentsMadePage() {
  return <ModulePage config={getModuleConfig("payments-made")} />;
}
