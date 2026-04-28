/**
 * IC Review screen — board-grade memo review with voting.
 *
 * Layout per UX W14: document-first center pane (frozen memo sections) with
 * a sticky right decision sidecar (vote + conditions + settle action).
 *
 * Hard requirement: memo must be frozen before voting opens.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import type { MemoSection } from "@/lib/memo/types";
import ICVotePanel from "./ic-vote-panel";
import { getVCRole, IC_VOTING_ROLES, PARTNER_ROLES } from "@/lib/rbac";

export default async function ICReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) notFound();

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, tenantId },
    include: {
      application: { select: { startupName: true } },
      vertical: { select: { name: true } },
    },
  });
  if (!deal) notFound();

  const memo = await db.vCICMemo.findUnique({
    where: { dealId: deal.id },
    include: {
      currentVersion: true,
      votes: {
        select: { id: true, voterId: true, decision: true, rationale: true, conditions: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const fundProfile = await db.vCFundProfile.findUnique({
    where: { tenantId },
    select: { icVotingMode: true, icQuorum: true, icThreshold: true },
  });

  // Resolve voter names for the vote list
  const voterIds = [...new Set(memo?.votes.map((v) => v.voterId) ?? [])];
  const voters = voterIds.length
    ? await db.user.findMany({
        where: { id: { in: voterIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const voterMap = Object.fromEntries(voters.map((u) => [u.id, u]));

  const viewerRole = await getVCRole(userId, tenantId);
  const canVote = viewerRole !== null && IC_VOTING_ROLES.includes(viewerRole);
  const canSettle = viewerRole !== null && PARTNER_ROLES.includes(viewerRole);

  const sections = (memo?.currentVersion?.sections as unknown as MemoSection[]) ?? [];
  const myVoteRaw = memo?.votes.find((v) => v.voterId === userId);
  const myVote = myVoteRaw
    ? {
        voterId: myVoteRaw.voterId,
        voterName: voterMap[myVoteRaw.voterId]
          ? `${voterMap[myVoteRaw.voterId].firstName} ${voterMap[myVoteRaw.voterId].lastName}`
          : "You",
        decision: myVoteRaw.decision,
        rationale: myVoteRaw.rationale,
        conditions: myVoteRaw.conditions,
      }
    : null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Center: memo content */}
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-3xl mx-auto p-8">
          <header className="mb-6 pb-4 border-b border-gray-200">
            <Link
              href={`/deals/${deal.id}`}
              className="text-xs text-gray-500 hover:text-gray-900 mb-2 inline-block"
            >
              ← Back to deal
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{deal.application.startupName}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {deal.vertical.name} · IC Review
            </p>
            {!memo || memo.status !== "frozen" ? (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
                Memo must be frozen before IC voting opens.{" "}
                <Link href={`/deals/${deal.id}/workbench/memo`} className="underline">
                  Open memo →
                </Link>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-2">
                Memo v{memo.currentVersion?.version ?? "?"} · ❄ Frozen
              </p>
            )}
          </header>

          {sections.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No memo content.</p>
          ) : (
            <article className="space-y-6">
              {sections.map((s) => (
                <section key={s.slug}>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">{s.title}</h2>
                  {s.contentHtml.trim() ? (
                    <div
                      className="prose prose-sm max-w-none text-gray-800"
                      dangerouslySetInnerHTML={{ __html: s.contentHtml }}
                    />
                  ) : (
                    <p className="text-xs text-gray-400 italic">Empty section.</p>
                  )}
                </section>
              ))}
            </article>
          )}
        </div>
      </main>

      {/* Right: voting sidecar */}
      <aside className="w-80 bg-gray-50 border-l border-gray-200 px-4 py-4 overflow-y-auto flex-shrink-0">
        {memo && memo.status === "frozen" ? (
          <ICVotePanel
            memoId={memo.id}
            myVote={myVote ?? null}
            allVotes={memo.votes.map((v) => ({
              voterId: v.voterId,
              voterName: voterMap[v.voterId]
                ? `${voterMap[v.voterId].firstName} ${voterMap[v.voterId].lastName}`
                : "Unknown",
              decision: v.decision,
              rationale: v.rationale,
              conditions: v.conditions,
            }))}
            mode={fundProfile?.icVotingMode ?? "single"}
            quorum={fundProfile?.icQuorum ?? 2}
            threshold={fundProfile?.icThreshold ?? "simple-majority"}
            canVote={canVote}
            canSettle={canSettle}
          />
        ) : (
          <div className="text-xs text-gray-500">
            Voting opens once the memo is frozen.
          </div>
        )}
      </aside>
    </div>
  );
}
