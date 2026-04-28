/**
 * Memo Builder — section list + per-section AI assist + version history.
 *
 * Sprint 3a: text-only editor (textarea per section). Sprint 4 swaps in a
 * proper rich editor (TipTap or Lexical) once we standardize the toolkit.
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import MemoEditor from "./memo-editor";
import type { MemoSection } from "@/lib/memo/types";
import { MEMO_SECTIONS } from "@/lib/ai/prompts/generate-memo-section";

export default async function MemoPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) notFound();

  const memo = await db.vCICMemo.findUnique({
    where: { dealId: params.id },
    include: {
      currentVersion: true,
    },
  });

  // Build initial sections — load from DB if a memo exists, otherwise seed
  // empty sections in the canonical order so the analyst sees the structure.
  let initialSections: MemoSection[];
  if (memo?.currentVersion) {
    initialSections = (memo.currentVersion.sections as unknown as MemoSection[]) ?? [];
  } else {
    initialSections = MEMO_SECTIONS.map((s, i) => ({
      id: `s${i + 1}`,
      slug: s.slug,
      title: s.title,
      contentHtml: "",
      generatedBy: "analyst",
      generatedAt: new Date().toISOString(),
    }));
  }

  const versionList = memo
    ? await db.vCICMemoVersion.findMany({
        where: { memoId: memo.id, tenantId },
        select: { id: true, version: true, source: true, changeNote: true, createdAt: true },
        orderBy: { version: "desc" },
        take: 10,
      })
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">IC Memo</h2>
            <p className="text-sm text-gray-500 mt-1">
              {memo
                ? `${memo.status} · v${memo.currentVersion?.version ?? "?"}`
                : "Draft (no versions saved yet)"}
            </p>
          </div>
        </div>
      </header>
      <MemoEditor
        dealId={params.id}
        initialSections={initialSections}
        versionList={versionList.map((v) => ({
          ...v,
          createdAt: v.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
