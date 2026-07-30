/**
 * Route-facing helpers for the scope module. Kept separate from the pure
 * server libs (scope-resolver / activity-repository) because these import
 * next/server.
 */

import { NextResponse } from "next/server";
import { ScopeError } from "./free-scope";

/**
 * Maps a thrown ScopeError to its `{ error, code, details }` + httpStatus.
 * Anything else becomes a logged 500. Matches the bare-JSON shape the
 * masters/projects routes already use.
 */
export function scopeErrorResponse(e: unknown, logLabel = "scope"): NextResponse {
  if (e instanceof ScopeError) {
    return NextResponse.json(
      { error: e.message, code: e.code, details: e.details },
      { status: e.httpStatus }
    );
  }
  console.error(`[${logLabel}] failed:`, e);
  return NextResponse.json({ error: "Operation failed" }, { status: 500 });
}

/**
 * True when the caller has a project-assignment whitelist that excludes `id`.
 * Callers respond 404 (not 403) so scoped users can't probe project existence.
 */
export function outOfProjectScope(
  projectIds: string[] | undefined,
  id: string
): boolean {
  return Array.isArray(projectIds) && !projectIds.includes(id);
}
