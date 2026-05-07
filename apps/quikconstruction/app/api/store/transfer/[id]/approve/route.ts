/**
 * POST /api/store/transfer/:id/approve — legacy singular alias.
 *
 * The canonical URL is `/api/store/transfers/:id/approve` (plural).
 * The frontend uses the plural form everywhere; this singular path
 * is preserved only because `scripts/gen-api-docs.js` still lists it
 * as a public endpoint, so any external consumer documented elsewhere
 * keeps working.
 *
 * The route re-exports the plural handler so there is exactly one
 * implementation to maintain.
 */
export { POST } from "../../../transfers/[id]/approve/route";
