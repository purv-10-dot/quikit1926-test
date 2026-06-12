import { z } from "zod";

/**
 * Canonical pagination contract for all list endpoints in this app.
 *
 * Why an allow-list instead of `min(1).max(N)`:
 *   - Stops clients from requesting absurd page sizes (cheap perf foot-gun).
 *   - Keeps API + UI in lock-step — the front-end dropdown ships the same
 *     four values, so unexpected sizes are a contract violation, not a
 *     "wide-open knob you happen not to twist."
 *
 * If you need a different cap for one route (e.g. an export cursor that
 * walks 500 rows at a time), don't widen these — use a separate schema.
 */
export const ALLOWED_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number];

export const pageSizeSchema = z.coerce
  .number()
  .int()
  .refine((n) => (ALLOWED_PAGE_SIZES as readonly number[]).includes(n), {
    message: `pageSize must be one of ${ALLOWED_PAGE_SIZES.join(", ")}`,
  })
  .default(DEFAULT_PAGE_SIZE);

export const pageSchema = z.coerce.number().int().min(1).default(1);

/** Common shape: `{ page, pageSize }`. Spread into module-specific list schemas. */
export const paginationFields = {
  page: pageSchema,
  pageSize: pageSizeSchema,
} as const;
