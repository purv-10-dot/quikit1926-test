import { NextRequest, NextResponse } from "next/server";

/**
 * Generic /api/masters/[entity]/[id] dispatcher.
 *
 * Like its sibling route, this catch-all is shadowed by specific
 * Prisma-backed routes (e.g. /api/masters/companies/[id]). The demo-store
 * fallback has been removed — a request that reaches this handler is
 * either (a) a misspelled entity, or (b) hitting an entity whose
 * specific route doesn't yet exist. We return 404 with a hint.
 */

const KNOWN_ENTITIES = new Set<string>([
  "companies",
  "gst",
  "tds",
  "departments",
  "work-categories",
  "cost-centers",
  "item-groups",
  "machinery",
  "customers",
]);

function fallback(entity: string) {
  if (!KNOWN_ENTITIES.has(entity)) {
    return NextResponse.json(
      { error: `Unknown entity: ${entity}` },
      { status: 404 }
    );
  }
  return NextResponse.json(
    {
      error: `Use the specific route /api/masters/${entity}/<id> — this catch-all is no longer wired to any data source.`,
      code: "USE_SPECIFIC_ROUTE",
    },
    { status: 404 }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  return fallback(params.entity);
}

export async function PUT(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  return fallback(params.entity);
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  return fallback(params.entity);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { entity: string; id: string } }
) {
  return fallback(params.entity);
}
