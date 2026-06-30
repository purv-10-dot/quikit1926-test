import { CreditNoteDetail } from "@/components/credit-notes/CreditNoteDetail";

export default function CreditNoteDetailPage({ params }: { params: { id: string } }) {
  return <CreditNoteDetail id={params.id} />;
}
