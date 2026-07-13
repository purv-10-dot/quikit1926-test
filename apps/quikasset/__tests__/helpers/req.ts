import { NextRequest } from "next/server";

/** Build a NextRequest for a route handler under test. */
export function makeReq(path: string, init?: { method?: string; body?: unknown }): NextRequest {
  const method = init?.method ?? "GET";
  const hasBody = init?.body !== undefined;
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(hasBody
      ? { body: JSON.stringify(init!.body), headers: { "content-type": "application/json" } }
      : {}),
  });
}
