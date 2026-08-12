import { prisma } from "@/lib/db/prisma";
import { maskHiddenLeadFields } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { ownerScopeFilter } from "@/lib/auth/owner-scope";
import { getPipelineConfig } from "@/lib/services/workspace/pipeline-config";
import type { SessionUser } from "@/types/permission";

/** Default kanban stages — used only when the org has no custom workspace pipeline configured. */
export const KANBAN_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"] as const;

export interface KanbanCard {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  score: number;
  ownerName: string | null;
  isStarred: boolean;
  stage: string;
}

export interface KanbanBucket {
  stage: string;
  total: number;
  items: KanbanCard[];
}

/**
 * Compute the kanban board for a user. Used by both the API route and the
 * Server Component page to keep one source of truth for the query + masking.
 *
 * Parity: legacy GET /leads/kanban/board.
 */
export async function buildKanbanBoard(opts: {
  user: SessionUser;
  perStage?: number;
  ownerName?: string;
  /** When set, only this single stage is queried (used by "Load more" per column). */
  stage?: string;
}): Promise<KanbanBucket[]> {
  const { user } = opts;
  const perStage = Math.min(500, Math.max(1, opts.perStage ?? 100));

  const acl = await accountScopeFilter(user);
  const ownerScope = await ownerScopeFilter(user);
  const baseAnd: Record<string, unknown>[] = [{ orgId: user.orgId }];
  if (acl) baseAnd.push(acl);
  if (ownerScope) baseAnd.push(ownerScope);
  if (opts.ownerName) baseAnd.push({ ownerName: opts.ownerName });

  const select = {
    id: true,
    name: true,
    company: true,
    email: true,
    phone: true,
    score: true,
    ownerName: true,
    isStarred: true,
    stage: true,
  } as const;

  const pipeline = await getPipelineConfig(user.orgId);
  const allStages = pipeline.stages.length > 0 ? pipeline.stages : (KANBAN_STAGES as readonly string[]);
  const stages = opts.stage ? allStages.filter((s) => s === opts.stage) : allStages;

  return Promise.all(
    stages.map(async (stage) => {
      const where = { AND: [...baseAnd, { stage }] };
      const [items, total] = await Promise.all([
        prisma.qceLead.findMany({ where, select, orderBy: { updatedAt: "desc" }, take: perStage }),
        prisma.qceLead.count({ where }),
      ]);
      const masked = await Promise.all(items.map((l) => maskHiddenLeadFields(user, l)));
      return { stage, total, items: masked as KanbanCard[] };
    }),
  );
}
