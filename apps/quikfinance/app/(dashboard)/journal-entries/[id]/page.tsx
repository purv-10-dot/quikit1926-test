import { JournalEntryDetail } from "@/components/journals/JournalEntryDetail";

export default function JournalEntryDetailPage({ params }: { params: { id: string } }) {
  return <JournalEntryDetail id={params.id} />;
}
