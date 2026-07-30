/**
 * Normalise a list response into an array, whichever envelope it arrived in.
 *
 * WHY THIS EXISTS. QuikLMS routes do not all wrap list payloads the same way.
 * Most return the documented `{ success, data }` envelope via `json()`, but some
 * return the collection BARE — `GET /api/batches` is `json(await findAll(...))`,
 * so its body IS the array. Callers therefore hand-rolled an unwrap, and the
 * hand-rolled versions disagreed:
 *
 *   Array.isArray(res) ? res : res?.data ?? []      // correct
 *   res.data?.data || res.data || []                // silently [] for a bare array
 *   res.data.data || res.data || []                 // THROWS for a bare array
 *
 * The third form is not a style nit. In `(tenant-admin)/school-courses` it read
 * `batchesRes.data.data`, `batchesRes.data` was `undefined`, and the resulting
 * TypeError aborted the loader midway — after the course list had been set but
 * before learners and batches were — so the Assign Course modal reported
 * "0 learners / 0 batches" for a tenant that had both, with nothing on screen to
 * say anything had failed.
 *
 * One helper so a route's envelope choice can never crash a caller again.
 */
export function toList<T = unknown>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];

  const one = (res as { data?: unknown } | null | undefined)?.data;
  if (Array.isArray(one)) return one as T[];

  // Doubly-wrapped: `{ data: { data: [...] } }`, which the paginated helpers emit.
  const two = (one as { data?: unknown } | null | undefined)?.data;
  if (Array.isArray(two)) return two as T[];

  return [];
}
