import { requireUser } from "@/lib/auth/require";
import { LeadScoringPageClient } from "@/components/settings/lead-scoring-page";

export default async function LeadScoringPage() {
  await requireUser();
  return <LeadScoringPageClient />;
}
