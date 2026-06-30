import { ModulePage } from "@/components/shared/ModulePage";
import { getModuleConfig } from "@/lib/modules";

export default function OcrBillsPage() {
  return <ModulePage config={getModuleConfig("ocr-bills")} />;
}
