"use client";

/**
 * "+ New Quote" button rendered on the Opportunity detail page.
 *
 * Why a client island instead of inlining: the parent page is a Server
 * Component (fetches Prisma directly), but creating a quote needs to
 * POST to /api/quotes and then `router.push(...)` to the new Quote
 * Builder — both of which require client-side JS.
 *
 * Behaviour mirrors how Salesforce / D365 do it: a single click on the
 * Opportunity creates a Draft quote pre-linked to the account + contact +
 * opportunity. No modal, no second screen — the rep lands directly on
 * the Quote Builder ready to add lines.
 *
 * Disabled state: shows tooltip when accountId is missing. Quotes require
 * an account by spec (QcfQuote.accountId is non-nullable), so without it
 * we'd hit a 400 from the API anyway — better to disable upfront.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NewQuoteFromOpportunityButton({
  accountId,
  contactId,
  opportunityId,
}: {
  accountId: string | null;
  contactId: string | null;
  opportunityId: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!accountId) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled
        title="Link this opportunity to an Account before creating a quote"
      >
        <Plus size={14} /> New quote
      </Button>
    );
  }

  async function createQuote() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          // contactId is optional — pre-fill only when known. The createQuote
          // service tenant-checks it; passing null skips that check entirely.
          ...(contactId ? { contactId } : {}),
          opportunityId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Failed to create quote");
      }
      // Hard navigate so the Quote Builder gets a fresh load (router.push
      // would client-side navigate but the builder fetches its own data
      // via useEffect anyway, so either works — hard nav is simpler).
      router.push(`/quotes/${json.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create quote");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => void createQuote()} disabled={submitting}>
        <Plus size={14} /> {submitting ? "Creating…" : "New quote"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
