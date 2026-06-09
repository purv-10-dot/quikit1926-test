import type { Prisma } from "@quikit/database";

/**
 * Prisma interactive transaction defaults for serverless (Neon + Vercel).
 * Default Prisma timeout is 5s — too tight for cold pools and multi-step CRM writes.
 */
export const SERVERLESS_TX_OPTIONS = {
  maxWait: 10_000,
  /** Quote PATCH with price-list apply can create/reprice many lines in one tx. */
  timeout: 30_000,
} as const;

type TransactionClient = Prisma.TransactionClient;

type TransactionCapable = {
  $transaction: <R>(
    fn: (tx: TransactionClient) => Promise<R>,
    options?: typeof SERVERLESS_TX_OPTIONS,
  ) => Promise<R>;
};

/** Run an interactive transaction with serverless-safe timeouts. */
export function serverlessTransaction<R>(
  client: TransactionCapable,
  fn: (tx: TransactionClient) => Promise<R>,
): Promise<R> {
  return client.$transaction(fn, SERVERLESS_TX_OPTIONS);
}
