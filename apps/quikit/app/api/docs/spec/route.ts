import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * GET /api/docs/spec
 *
 * Returns the combined OpenAPI 3.0 YAML for all QuikIT apps. Internal-only —
 * auth-checked. Loaded by the Swagger UI page at /api/docs.
 *
 * The spec lives at apps/quikit/lib/openapi.yaml — committed (so it ships
 * with deploys) but NOT in /public (so it's not served unauthenticated).
 *
 * Regenerate with:
 *   python3 _internal/api-contract-tools/build_openapi_spec.py \
 *     > apps/quikit/lib/openapi.yaml
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const path = join(process.cwd(), "apps", "quikit", "lib", "openapi.yaml");
    // In the deployed Vercel layout the cwd may already be apps/quikit, so try a fallback.
    let yaml: string;
    try {
      yaml = await readFile(path, "utf-8");
    } catch {
      const fallback = join(process.cwd(), "lib", "openapi.yaml");
      yaml = await readFile(fallback, "utf-8");
    }
    return new NextResponse(yaml, {
      status: 200,
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        // Hint browsers + Swagger UI: don't cache during active dev.
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to read OpenAPI spec";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
