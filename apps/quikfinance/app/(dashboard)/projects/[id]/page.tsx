import { DetailPage } from "@/components/shared/DetailPage";
import { getModuleConfig } from "@/lib/modules";

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  return <DetailPage config={getModuleConfig("projects")} id={params.id} />;
}
