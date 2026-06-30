import { FormPage } from "@/components/shared/FormPage";
import { getModuleConfig } from "@/lib/modules";

export default function NewOcrBillPage() {
  return <FormPage config={getModuleConfig("ocr-bills")} />;
}
