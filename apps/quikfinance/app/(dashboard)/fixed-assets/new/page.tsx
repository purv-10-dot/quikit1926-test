import { FormPage } from "@/components/shared/FormPage";
import { getModuleConfig } from "@/lib/modules";

export default function NewFixedAssetPage() {
  return <FormPage config={getModuleConfig("fixed-assets")} />;
}
