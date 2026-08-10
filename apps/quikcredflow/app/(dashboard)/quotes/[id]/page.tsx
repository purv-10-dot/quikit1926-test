import { requireUser } from "@/lib/auth/require";
import { PageContainer } from "@/components/ui/container";
import { QuoteBuilder } from "@/components/quotes/quote-builder";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  return (
    <PageContainer size="wide">
      <QuoteBuilder quoteId={id} />
    </PageContainer>
  );
}
