/**
 * Term Sheet tab — generate / regenerate / preview.
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import TermSheetClient from "./term-sheet-client";
import { getVCRole, PARTNER_ROLES } from "@/lib/rbac";

export default async function TermSheetPage({ params }: { params: { id: string } }) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) notFound();

  const viewerRole = await getVCRole(userId, tenantId);
  const canGenerate = viewerRole !== null && PARTNER_ROLES.includes(viewerRole);

  const ts = await db.vCTermSheet.findUnique({
    where: { dealId: params.id },
    select: {
      id: true, version: true, status: true, renderedBodyHtml: true,
      sentAt: true, signedAt: true, updatedAt: true,
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <header className="mb-5">
        <h2 className="text-xl font-semibold text-gray-900">Term Sheet</h2>
        <p className="text-sm text-gray-500 mt-1">
          Auto-generated from your tenant&apos;s term sheet template + deal data.
          Edit the template at{" "}
          <a href="/admin/term-sheet-template" className="text-blue-600 hover:underline">
            /admin/term-sheet-template
          </a>
          .
        </p>
      </header>
      <TermSheetClient
        dealId={params.id}
        canGenerate={canGenerate}
        existing={
          ts
            ? {
                version: ts.version,
                status: ts.status,
                renderedBodyHtml: ts.renderedBodyHtml,
                updatedAt: ts.updatedAt.toISOString(),
              }
            : null
        }
      />
    </div>
  );
}
