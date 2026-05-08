/**
 * unwrap — strip QuikIT's `{ success, data }` envelope.
 *
 * Every QuikIT API route returns either `{ success: true, data: <payload> }`
 * or `{ success: false, error: string }`. The pages and components in this
 * app were originally written for the standalone quiksocial-v2 routes that
 * returned the payload at the top level. To minimise per-site edits during
 * the integration port, every fetch handler funnels its parsed JSON through
 * this helper — the result is the de-enveloped payload (or the original
 * object when no envelope is present, which keeps fallback objects like
 * `{ role: null }` working unchanged).
 *
 * Usage:
 *   .then((r) => r.json())
 *   .then(unwrap)            // <- inserted line; rest of the chain unchanged
 *   .then((data) => setX(data.brand))
 *
 *   const data = unwrap(await res.json());
 */
// `await res.json()` is typed `any` upstream from this helper, so unwrap
// matches that — the helper is the boundary between untyped JSON and the
// typed call site. Callers can pass an explicit T (e.g. `unwrap<Foo>(...)`)
// when they want a narrower return type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrap<T = any>(json: any): T {
  if (json !== null && typeof json === "object" && "data" in json) {
    return json.data as T;
  }
  return json as T;
}
