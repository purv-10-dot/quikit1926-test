import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/openapi/spec";

/**
 * GET /api/v1/openapi.json — the OpenAPI document powering the Scalar
 * reference at /api/v1/docs. Public (it only describes the API surface; every
 * documented call still requires a Bearer token). Cached briefly at the edge.
 */
export function GET(): NextResponse {
  // Cache in production (the spec is regenerated at build time via prebuild);
  // never cache in dev so a regenerated spec shows up on refresh.
  const cache =
    process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store";
  return NextResponse.json(buildOpenApiSpec(), {
    headers: { "Cache-Control": cache },
  });
}
