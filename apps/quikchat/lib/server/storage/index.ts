/**
 * Storage driver selection. GCS when configured (env), local otherwise. The
 * active driver is a process singleton; selection is logged once at first use.
 */
import { logger } from "@/lib/shared";
import { GcsDriver } from "./gcs";
import { LocalDriver } from "./local";
import type { StorageDriver } from "./types";

export type DriverName = "gcs" | "local";

/** Pure driver selection from an env-like object (for tests). */
export function selectDriverName(
  env: Record<string, string | undefined> = process.env,
): DriverName {
  if (env.STORAGE_DRIVER === "gcs") return "gcs";
  if (env.STORAGE_DRIVER === "local") return "local";
  // Auto: GCS if a bucket + some credential form is present.
  const hasCreds = !!(env.GCS_CREDENTIALS_JSON || env.GOOGLE_APPLICATION_CREDENTIALS);
  if (env.GCS_BUCKET && hasCreds) return "gcs";
  return "local";
}

let cached: { name: DriverName; driver: StorageDriver } | null = null;

export function getStorage(): StorageDriver {
  const name = selectDriverName();
  if (cached && cached.name === name) return cached.driver;
  const driver: StorageDriver = name === "gcs" ? new GcsDriver() : new LocalDriver();
  logger.info({ driver: name }, "storage driver active");
  cached = { name, driver };
  return driver;
}

/** Test hook: drop the cached singleton so a new env selection takes effect. */
export function __resetStorageForTest(): void {
  cached = null;
}

export * from "./types";
