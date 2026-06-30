import { FilterView } from "./_components/filter-view";

export default function FilterPage({ params }: { params: { id: string } }) {
  // Remount per slug so each default filter gets its own fresh state (and its
  // own persisted filter row).
  return <FilterView key={params.id} filterId={params.id} />;
}
