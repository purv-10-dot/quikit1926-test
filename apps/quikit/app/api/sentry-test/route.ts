/**
 * Temporary smoke-test endpoint for Sentry.
 * Visit /api/sentry-test on prod → should throw a 500 → Sentry captures it.
 * DELETE this file after verifying Sentry works.
 */
import { NextResponse } from "next/server";

export async function GET() {
  throw new Error("Sentry server smoke test — quikit");
  // Unreachable, but satisfies TypeScript
  return NextResponse.json({ ok: true });
}
