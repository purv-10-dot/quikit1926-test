/**
 * Upwork Connects values shared by the browser and the server.
 *
 * SEPARATE FROM connects-config.ts ON PURPOSE: that module imports Prisma, so a
 * client component importing from it would drag the database client into the
 * browser bundle. Everything here is a plain constant, type or pure function
 * and is safe to import from either side.
 */

/**
 * The exact tool name that turns on Connects behaviour.
 *
 * A single exported constant, compared literally, so "Upwork connect" or
 * "Upwork Connect" can never half-match: the UI offers this string as a preset
 * rather than letting it be typed, and the server recognises only this.
 */
export const UPWORK_CONNECTS_TOOL_NAME = "Upwork Connects";

/** Case/whitespace-tolerant check, so an existing row still resolves. */
export function isUpworkConnectsTool(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === UPWORK_CONNECTS_TOOL_NAME.toLowerCase();
}

export interface UpworkConnectsConfig {
  /** Connects sold per package. The divisor in the per-Connect rate. */
  packageConnects: number;
  /** What one package costs, in `currency`. */
  packagePriceUsd: number;
  /** Currency of `packagePriceUsd`. Upwork bills Connects in USD. */
  currency: string;
  /** Manually configured USD→INR rate used to store the cost in INR. */
  usdToInr: number;
}

/**
 * Defaults match the documented Upwork price at time of writing (100 Connects =
 * $15). They are only a STARTING POINT for an org that has never opened the
 * settings dialog — every calculation reads the stored config, so an org that
 * changes the price is never silently pulled back to these numbers.
 */
export const DEFAULT_UPWORK_CONNECTS_CONFIG: UpworkConnectsConfig = {
  packageConnects: 100,
  packagePriceUsd: 15,
  currency: "USD",
  usdToInr: 95,
};
