import { db as _db } from "@quikit/database";

// Token models (QiTokenBalance etc.) exist in the DB schema but the Prisma
// generated client is not yet regenerated in this workspace, so we cast to
// `any` here. Remove the cast after running `prisma generate`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any;

export const DEFAULT_TOTAL_TOKENS = 100_000;
const GEMINI_MODEL_DEFAULT = process.env.GEMINI_MODEL ?? "gemini-1.5-flash-latest";

// ─── types ────────────────────────────────────────────────────────────────────

export interface TokenBalance {
  totalTokens: number;
  usedTokens: number;
  remainingTokens: number;
}

export interface RecordUsageParams {
  userId: string;
  orgId: string;
  feature: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  status?: "success" | "error" | "limit_exceeded";
}

export interface UsageLogRow {
  id: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  status: string;
  createdAt: Date;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** ~4 chars per token is a widely-used rough estimate. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// ─── balance ─────────────────────────────────────────────────────────────────

/** Returns the balance row, creating it with the default grant if absent. */
export async function getOrCreateBalance(userId: string, orgId: string) {
  const existing = await db.qiTokenBalance.findUnique({ where: { userId } });
  if (existing) return existing;

  // First-time: grant default allocation + record the initial credit transaction.
  return db.$transaction(async (tx: typeof db) => {
    const balance = await tx.qiTokenBalance.create({
      data: { userId, orgId, totalTokens: DEFAULT_TOTAL_TOKENS, usedTokens: 0 },
    });
    await tx.qiTokenTransaction.create({
      data: {
        userId,
        orgId,
        type: "CREDIT",
        amount: DEFAULT_TOTAL_TOKENS,
        balanceBefore: 0,
        balanceAfter: DEFAULT_TOTAL_TOKENS,
        reason: "initial_grant",
      },
    });
    return balance;
  });
}

export async function getBalance(userId: string, orgId: string): Promise<TokenBalance> {
  const row = await getOrCreateBalance(userId, orgId);
  const remaining = Math.max(0, row.totalTokens - row.usedTokens);
  return { totalTokens: row.totalTokens, usedTokens: row.usedTokens, remainingTokens: remaining };
}

/** Returns true if the user has at least `needed` tokens remaining. */
export async function hasSufficientTokens(userId: string, orgId: string, needed: number): Promise<boolean> {
  const bal = await getBalance(userId, orgId);
  return bal.remainingTokens >= needed;
}

// ─── usage recording ─────────────────────────────────────────────────────────

/**
 * Atomically: deduct tokens, insert usage log, insert debit transaction.
 * Returns the usage log id.
 */
export async function recordUsage(params: RecordUsageParams): Promise<string> {
  const { userId, orgId, feature, model, inputTokens, outputTokens, status = "success" } = params;
  const totalTokens = inputTokens + outputTokens;
  const modelName = model ?? GEMINI_MODEL_DEFAULT;

  return db.$transaction(async (tx: typeof db) => {
    // Re-read balance inside the transaction for a consistent snapshot.
    let balance = await tx.qiTokenBalance.findUnique({ where: { userId } });
    if (!balance) {
      balance = await tx.qiTokenBalance.create({
        data: { userId, orgId, totalTokens: DEFAULT_TOTAL_TOKENS, usedTokens: 0 },
      });
    }

    const balanceBefore = Math.max(0, balance.totalTokens - balance.usedTokens);
    const deduct = status === "success" ? Math.min(totalTokens, balanceBefore) : 0;
    const newUsed = balance.usedTokens + deduct;

    if (deduct > 0) {
      await tx.qiTokenBalance.update({
        where: { userId },
        data: { usedTokens: newUsed },
      });
    }

    const log = await tx.qiTokenUsageLog.create({
      data: { userId, orgId, feature, model: modelName, inputTokens, outputTokens, totalTokens, status },
    });

    if (deduct > 0) {
      await tx.qiTokenTransaction.create({
        data: {
          userId,
          orgId,
          type: "DEBIT",
          amount: deduct,
          balanceBefore,
          balanceAfter: Math.max(0, balanceBefore - deduct),
          reason: "ai_usage",
          referenceId: log.id,
        },
      });
    }

    return log.id;
  });
}

// ─── usage history ───────────────────────────────────────────────────────────

export async function getUsageHistory(
  userId: string,
  { page = 1, limit = 20 }: { page?: number; limit?: number } = {}
): Promise<{ rows: UsageLogRow[]; total: number }> {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    db.qiTokenUsageLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, feature: true, model: true,
        inputTokens: true, outputTokens: true, totalTokens: true,
        status: true, createdAt: true,
      },
    }),
    db.qiTokenUsageLog.count({ where: { userId } }),
  ]);
  return { rows, total };
}
