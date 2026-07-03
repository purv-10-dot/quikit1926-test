import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function PaymentsReceivedPage() {
  return <ModulePage config={getModuleConfig("payments-received")} />;
}
