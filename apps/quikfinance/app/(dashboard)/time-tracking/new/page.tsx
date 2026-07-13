import { FormPage } from "@/components/shared/FormPage";
import { getModuleConfig } from "@/lib/modules";

export default function NewTimeEntryPage() {
  return <FormPage config={getModuleConfig("time-tracking")} />;
}
