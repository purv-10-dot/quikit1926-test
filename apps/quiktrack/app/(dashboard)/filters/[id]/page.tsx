import { FilterView } from "./_components/filter-view";

export default function FilterPage({ params }: { params: { id: string } }) {
  return <FilterView filterId={params.id} />;
}
