import { FormPage } from "@/components/shared/FormPage";
import { getModuleConfig } from "@/lib/modules";

export default function NewImportPage() {
  return <FormPage config={getModuleConfig("imports")} />;
}
