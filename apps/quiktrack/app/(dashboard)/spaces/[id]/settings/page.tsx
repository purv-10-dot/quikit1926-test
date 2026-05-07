import { DetailsForm } from "./_components/details-form";

export default function DetailsPage({ params }: { params: { id: string } }) {
  return <DetailsForm projectId={params.id} />;
}
