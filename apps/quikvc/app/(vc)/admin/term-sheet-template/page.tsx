/**
 * Admin — Term Sheet Template editor.
 *
 * Single tenant template (HTML body with {{variable}} placeholders).
 * Server-renders the current template, client component handles edit/save.
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { DEFAULT_TEMPLATE_HTML } from "@/lib/term-sheet/render";
import TermSheetTemplateEditor from "./editor-client";

export default async function TermSheetTemplatePage() {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) notFound();

  const tpl = await db.vCTermSheetTemplate.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, bodyHtml: true, updatedAt: true },
  });

  const initial = tpl ?? {
    id: null as string | null,
    name: "Default Term Sheet",
    bodyHtml: DEFAULT_TEMPLATE_HTML,
    updatedAt: null as Date | null,
  };

  return (
    <div className="px-6 py-6 max-w-6xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Term Sheet Template</h1>
        <p className="text-sm text-gray-500 mt-1">
          Single tenant-wide template used to render every deal&apos;s term sheet. Use{" "}
          <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">{"{{variable}}"}</code> placeholders for deal data.
        </p>
      </header>

      <TermSheetTemplateEditor
        initialName={initial.name}
        initialBodyHtml={initial.bodyHtml}
        updatedAt={initial.updatedAt ? new Date(initial.updatedAt).toISOString() : null}
      />
    </div>
  );
}
