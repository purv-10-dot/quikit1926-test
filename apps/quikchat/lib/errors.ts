/**
 * Transport-agnostic error carrying an HTTP status. The platform package throws
 * the same shape; route helpers map it to a Response. Keeping it here (not in
 * the route layer) means `getOrgId` / `assertMembership` can be called from
 * anywhere and still signal 401/403 consistently.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isHttpError(e: unknown): e is HttpError {
  return e instanceof HttpError;
}
