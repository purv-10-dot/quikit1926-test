/**
 * Shared error type for helpdesk API + RBAC code. Lives in its own module so
 * lib/api.ts, lib/rbac.ts and lib/helpdesk-context.ts can all import it
 * without forming an import cycle.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
