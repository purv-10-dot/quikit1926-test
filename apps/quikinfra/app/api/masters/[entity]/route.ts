import { NextRequest, NextResponse } from "next/server";

/**
 * Generic /api/masters/[entity] dispatcher.
 *
 * In practice this catch-all is shadowed by specific Prisma-backed routes
 * (e.g. /api/masters/companies, /api/masters/gst, /api/masters/customers,
 * /api/masters/work-categories, /api/masters/cost-centers,
 * /api/masters/item-groups, /api/masters/machinery, /api/masters/tds,
 * /api/masters/departments) which take routing priority. This handler
 * only fires when a previously-supported demo-store entity has no
 * specific route. We return a 404 with an explanatory message so the
 * caller migrates to the specific route — the demo-store fallback is
 * gone.
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
      error: `Use the specific route /api/masters/${entity} — this catch-all is no longer wired to any data source.`,
      code: "USE_SPECIFIC_ROUTE",
    },
    { status: 404 }
  );
}

export async function GET(_req: NextRequest, { params }: { params: { entity: string } }) {
  return fallback(params.entity);
}

export async function POST(_req: NextRequest, { params }: { params: { entity: string } }) {
  return fallback(params.entity);
}
