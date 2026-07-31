/**
 * FREE_SCOPE feature gate + shared typed error.
 *
 * The per-project `CnProject.executionMode` column is the primary switch that
 * decides a project's lifecycle anchor (BOQ leaf vs activity item). This env
 * flag is a global kill-switch layered on top so the whole feature can ship
 * dark: it is ON by default and only the literal string "false" disables it.
 */
export function isFreeScopeEnabled(): boolean {
  return process.env.FREE_SCOPE_MODE !== "false";
}

/**
 * Typed error used across the scope module. Mirrors the ProgressLedgerError /
 * BOQError shape so route handlers can map `code` + `httpStatus` uniformly.
 */
export class ScopeError extends Error {
  code: string;
  httpStatus: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    httpStatus = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.name = "ScopeError";
  }
}
