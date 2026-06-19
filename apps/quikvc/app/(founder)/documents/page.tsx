/**
 * Founder Documents — upload + view docs against the founder's active deal.
 *
 * Sprint 2 scope: shows the canonical 5 doc categories as upload slots; each
 * upload posts to /api/documents/upload (Vercel Blob). Status updates from
 * VC team appear here in real time.
 */
import { getDevAwareSession } from "@/lib/dev-session";

import { db } from "@/lib/db";
import DocumentsClient from "./documents-client";

const REQUIRED_CATEGORIES = [
  { slug: "pitch-deck",      label: "Pitch deck" },
  { slug: "financials",      label: "Audited financials" },
  { slug: "incorporation",   label: "Incorporation certificate" },
  { slug: "gst-returns",     label: "GST returns" },
  { slug: "bank-statements", label: "Bank statements" },
];

export default async function FounderDocumentsPage() {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  const userId = session?.user?.id;

  if (!orgId || !userId) {
    return (
      <div className="px-4 py-5 text-sm text-gray-500">
        You need to sign in to view documents.
      </div>
    );
  }

  // Find the founder's most recent application (Sprint 2 assumes 1 active per founder)
  const application = await db.vCApplication.findFirst({
    where: { orgId, founderId: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, deal: { select: { id: true, currentStage: true } } },
  });

  if (!application?.deal) {
    return (
      <div className="px-4 py-5 max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
        <p className="mt-2 text-sm text-gray-500">
          You don&apos;t have an active application yet. Start your application
          first.
        </p>
      </div>
    );
  }

  const docs = await db.vCDealDocument.findMany({
    where: { orgId, dealId: application.deal.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, category: true, filename: true, mimeType: true,
      blobUrl: true, version: true, status: true, rejectReason: true,
      sizeBytes: true, createdAt: true,
    },
  });

  return (
    <div className="px-4 py-5 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload documents requested by the VC team. They&apos;ll review each
          one and update the status here.
        </p>
      </header>
      <DocumentsClient
        dealId={application.deal.id}
        categories={REQUIRED_CATEGORIES}
        documents={docs.map((d) => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
