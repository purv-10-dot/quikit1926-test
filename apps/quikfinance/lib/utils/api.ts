/**
 * Build the URL for a single record from a collection apiPath, correctly
 * placing the id before any query string. e.g.
 *   itemPath("/api/v1/payments?type=made", "abc") -> "/api/v1/payments/abc?type=made"
 *   itemPath("/api/v1/customers", "abc")          -> "/api/v1/customers/abc"
 */
export function itemPath(apiPath: string, id: string): string {
  const [path, query] = apiPath.split("?");
  return `${path.replace(/\/$/, "")}/${id}${query ? `?${query}` : ""}`;
}
