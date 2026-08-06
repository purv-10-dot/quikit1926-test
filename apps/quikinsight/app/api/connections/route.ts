import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLATFORM_CONFIGS } from "@/lib/types/connections";
import type { Platform } from "@/lib/types/connections";
import { getActiveWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user.orgId as string) ?? "");

  const connections = await prisma.platformConnection.findMany({
    where:   { userId: session.user.id, workspaceId },
    include: {
      syncs: {
        orderBy: { startedAt: "desc" },
        take:    1,
        select:  { status: true, startedAt: true },
      },
    },
  });

  const PRISMA_TO_PLATFORM: Record<string, Platform> = {
    GOOGLE_ANALYTICS:        "google",
    GOOGLE_SEARCH_CONSOLE:   "google",
    YOUTUBE:                 "google",
    GOOGLE_ADS:              "google_ads",
    GOOGLE_BUSINESS_PROFILE: "gbp",
    META_FACEBOOK:           "meta",
    META_INSTAGRAM:          "meta",
    META_ADS:                "meta_ads",
    LINKEDIN:                "linkedin",
    HUBSPOT:                 "hubspot",
    SALESFORCE:              "salesforce",
    MAILCHIMP:               "mailchimp",
    DYNAMICS:                "dynamics",
    ZOHO:                    "zoho",
    QUIKCRM:                 "quikcrm",
  };

  // Build a map keyed by lowercase platform (first match wins for status/sync)
  const connMap: Record<string, typeof connections[0]> = {};
  for (const c of connections) {
    const key = PRISMA_TO_PLATFORM[c.platform as string];
    if (key && !connMap[key]) connMap[key] = c;
  }

  // Index every connection by its raw Prisma enum so we can bundle Google's
  // three sub-platform metadata blobs into one card.
  const byEnum: Record<string, typeof connections[0]> = {};
  for (const c of connections) byEnum[c.platform as string] = c;

  // Which platforms have OAuth/API credentials present in the environment
  const CREDS: Record<Platform, boolean> = {
    google:     !!process.env.GOOGLE_CLIENT_ID,
    google_ads: !!process.env.GOOGLE_ADS_CLIENT_ID,
    gbp:        !!process.env.GOOGLE_CLIENT_ID,
    meta:       !!process.env.META_APP_ID,
    meta_ads:   !!process.env.META_ADS_APP_ID,
    linkedin:   !!process.env.LINKEDIN_CLIENT_ID,
    hubspot:    !!process.env.HUBSPOT_CLIENT_ID,
    salesforce: !!process.env.SALESFORCE_CLIENT_ID,
    mailchimp:  !!process.env.MAILCHIMP_CLIENT_ID,
    dynamics:   !!process.env.DYNAMICS_CLIENT_ID,
    zoho:       !!process.env.ZOHO_CLIENT_ID,
    quikcrm:    true, // API key — no server-side env credential needed
  };

  const result = (Object.keys(PLATFORM_CONFIGS) as Platform[])
    // GBP is handled inside the Google card now — no standalone card
    .filter((platform) => platform !== "gbp")
    .map((platform) => {
    const conn = connMap[platform];

    // For Google, expose the per-service metadata under stable keys so the
    // configure panel can show GA4 properties, GSC sites, and the YT channel.
    let metadata: Record<string, unknown> = (conn?.metadata as Record<string, unknown>) ?? {};
    if (platform === "google") {
      metadata = {
        ga4: (byEnum["GOOGLE_ANALYTICS"]?.metadata as Record<string, unknown>)        ?? {},
        yt:  (byEnum["YOUTUBE"]?.metadata as Record<string, unknown>)                 ?? {},
        gsc: (byEnum["GOOGLE_SEARCH_CONSOLE"]?.metadata as Record<string, unknown>)   ?? {},
        gbp: (byEnum["GOOGLE_BUSINESS_PROFILE"]?.metadata as Record<string, unknown>) ?? {},
      };
    }

    return {
      platform,
      name:        PLATFORM_CONFIGS[platform].name,
      description: PLATFORM_CONFIGS[platform].description,
      color:       PLATFORM_CONFIGS[platform].color,
      dataTypes:   PLATFORM_CONFIGS[platform].dataTypes,
      connected:      conn?.status === "CONNECTED",
      connectedAt:    conn?.createdAt?.toISOString() ?? null,
      lastSync:       conn?.syncs[0]?.startedAt?.toISOString() ?? null,
      lastSyncStatus: conn?.syncs[0]?.status ?? null,
      metadata,
      prismaPlatform: conn?.platform ?? null,
      configured:     CREDS[platform],
    };
  });

  return NextResponse.json({ connections: result });
}
