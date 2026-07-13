import { DetailPage } from "@/components/shared/DetailPage";
import { getModuleConfig } from "@/lib/modules";

export default function TimeEntryDetailPage({ params }: { params: { id: string } }) {
  return <DetailPage config={getModuleConfig("time-tracking")} id={params.id} />;
}
