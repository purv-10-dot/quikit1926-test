/**
 * Runtime client selection. `RUNTIME_MODE=http` activates the real client (needs
 * `RUNTIME_BASE_URL`); anything else → the stub. A misconfigured `http` falls
 * back to stub with a boot warning. The active mode is logged once.
 */
import { logger } from "@/lib/shared";
import { HttpRuntimeClient } from "./http";
import { StubRuntimeClient } from "./stub";
import type { RuntimeClient, RuntimeMode } from "./types";

/** Pure mode selection from an env-like object (for tests). */
export function selectRuntimeMode(env: Record<string, string | undefined> = process.env): {
  mode: RuntimeMode;
  warning?: string;
} {
  if (env.RUNTIME_MODE === "http") {
    if (env.RUNTIME_BASE_URL) return { mode: "http" };
    return { mode: "stub", warning: "RUNTIME_MODE=http but RUNTIME_BASE_URL is unset" };
  }
  return { mode: "stub" };
}

let cached: { mode: RuntimeMode; client: RuntimeClient } | null = null;

export function getRuntimeClient(): RuntimeClient {
  const { mode, warning } = selectRuntimeMode();
  if (cached && cached.mode === mode) return cached.client;
  if (warning) logger.warn({ warning }, "runtime client misconfigured — falling back to stub");
  const client: RuntimeClient =
    mode === "http"
      ? new HttpRuntimeClient(process.env.RUNTIME_BASE_URL!)
      : new StubRuntimeClient();
  logger.info({ mode }, "runtime client active");
  cached = { mode, client };
  return client;
}

/** Test hook: drop the cached client so a new env selection takes effect. */
export function __resetRuntimeForTest(): void {
  cached = null;
}

export * from "./types";
