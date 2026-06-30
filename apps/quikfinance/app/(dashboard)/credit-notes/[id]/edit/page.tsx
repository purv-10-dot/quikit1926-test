import { CreditNoteForm } from "@/components/credit-notes/CreditNoteForm";

export default function EditCreditNotePage({ params }: { params: { id: string } }) {
  return <CreditNoteForm creditNoteId={params.id} />;
}
