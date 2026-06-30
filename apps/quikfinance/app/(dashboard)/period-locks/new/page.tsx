import { FormPage } from "@/components/shared/FormPage";
import { getModuleConfig } from "@/lib/modules";

export default function NewPeriodLockPage() {
  return <FormPage config={getModuleConfig("period-locks")} />;
}
