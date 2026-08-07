import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceId } from "@/lib/workspace";

export const runtime = "nodejs";

// Which selectable entities each connector (backend platform key) exposes, and
// how they're stored in the connection metadata. Drives the Configure picker.
type Spec = {
  prismaPlatform: string;
  label: string;       // e.g. "GA4 property"
  idField: string;     // metadata key holding the selected id
  nameField?: string;  // metadata key holding the selected display name
  optionsField: string; // metadata key holding the JSON list of choices
  shape: "idName" | "urls";
};

const SELECTABLE: Record<string, Spec[]> = {
  google: [
    { prismaPlatform: "GOOGLE_ANALYTICS",        label: "GA4 property",              idField: "propertyId", nameField: "propertyName",  optionsField: "allProperties", shape: "idName" },
    { prismaPlatform: "GOOGLE_SEARCH_CONSOLE",   label: "Search Console site",       idField: "siteUrl",                                optionsField: "allSites",      shape: "urls"   },
    { prismaPlatform: "YOUTUBE",                 label: "YouTube channel",           idField: "channelId",  nameField: "channelTitle",  optionsField: "allChannels",   shape: "idName" },
    { prismaPlatform: "GOOGLE_BUSINESS_PROFILE", label: "Business Profile location", idField: "locationId", nameField: "locationName",  optionsField: "allLocations",  shape: "idName" },
  ],
  meta: [
    { prismaPlatform: "META_FACEBOOK", label: "Facebook Page (+ linked Instagram)", idField: "selectedPageId", nameField: "pageName", optionsField: "allPages", shape: "idName" },
  ],
  google_ads: [
    { prismaPlatform: "GOOGLE_ADS", label: "Ads account", idField: "customerId", nameField: "customerName", optionsField: "allCustomers", shape: "idName" },
  ],
  meta_ads: [
    { prismaPlatform: "META_ADS", label: "Ad account", idField: "adAccountId", nameField: "adAccountName", optionsField: "allAdAccounts", shape: "idName" },
  ],
  linkedin: [
    { prismaPlatform: "LINKEDIN", label: "Company page", idField: "organizationId", nameField: "organizationName", optionsField: "allOrganizations", shape: "idName" },
  ],
};

function parseOptions(raw: unknown, shape: "idName" | "urls"): { id: string; name: string }[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (shape === "urls") return (parsed as string[]).map((s) => ({ id: s, name: s }));
    return (parsed as Array<{ id?: string; name?: string }>).map((o) => ({ id: o.id ?? "", name: o.name ?? o.id ?? "" }));
  } catch {
    return [];
  }
}

// GET /api/connections/options?platform=google → selectable entities + options.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const platform = new URL(req.url).searchParams.get("platform") ?? "";
  const specs = SELECTABLE[platform];
  if (!specs) return NextResponse.json({ groups: [] });

  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");

  const conns = await prisma.platformConnection.findMany({
    where: { userId: session.user.id, workspaceId, platform: { in: specs.map((s) => s.prismaPlatform) as never[] }, status: "CONNECTED" },
    select: { platform: true, metadata: true },
  });
  const metaByPlatform = new Map<string, Record<string, unknown>>();
  for (const c of conns) metaByPlatform.set(c.platform as string, (c.metadata as Record<string, unknown>) ?? {});

  const groups = specs
    .map((s) => {
      const m = metaByPlatform.get(s.prismaPlatform);
      if (!m) return null; // that sub-platform isn't connected
      const options = parseOptions(m[s.optionsField], s.shape);
      const selectedId = (m[s.idField] as string) ?? "";
      if (options.length === 0 && !selectedId) return null; // nothing to choose
      return {
        prismaPlatform: s.prismaPlatform,
        label: s.label,
        idField: s.idField,
        nameField: s.nameField ?? null,
        selectedId,
        options: options.length ? options : [{ id: selectedId, name: selectedId }],
      };
    })
    .filter(Boolean);

  return NextResponse.json({ groups });
}
