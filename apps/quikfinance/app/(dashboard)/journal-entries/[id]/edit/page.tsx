import { JournalEntryForm } from "@/components/forms/JournalEntryForm";

export default function EditJournalEntryPage({ params }: { params: { id: string } }) {
  return <JournalEntryForm journalId={params.id} />;
}
