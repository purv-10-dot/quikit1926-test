import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/requireAdmin";
import {
  migrateFromJira,
  type MigrationReport,
} from "@/lib/services/migration/migrate-jira";

const bodySchema = z.object({
  domain: z.string().trim().min(3),
  email: z.string().trim().email(),
  apiToken: z.string().trim().min(8),
  projectKeys: z.array(z.string().trim().min(1)).optional(),
  includeComments: z.boolean().optional(),
  includeWorklog: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  // CSV-sourced accountId → email overrides for privacy-mode Jira users.
  // See docs/jira-migration-csv-users.md.
  userMappings: z
    .array(
      z.object({
        accountId: z.string().trim().min(1),
        email: z.string().trim().email(),
        firstName: z.string().trim().optional(),
        lastName: z.string().trim().optional(),
      }),
    )
    .optional(),
});

// POST /api/migration/jira
// One-shot Atlassian Jira Cloud → QuikTrack importer. Admin-only.
//
// Runs synchronously and returns a counts report. For very large Jira sites
// the request can exceed serverless timeouts; today the recommendation is to
// run a `dryRun: true` pass first to size the workload, then split via
// `projectKeys` if needed.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId } = auth as { orgId: string; userId: string };

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      // Include the field path so "Invalid email" tells you which row /
      // field in the userMappings CSV is the problem.
      const first = parsed.error.errors[0];
      const path = first?.path?.length ? ` (${first.path.join(".")})` : "";
      return NextResponse.json(
        {
          success: false,
          error: `${first?.message ?? "Invalid input"}${path}`,
        },
        { status: 400 },
      );
    }

    const report: MigrationReport = await migrateFromJira({
      creds: {
        domain: parsed.data.domain,
        email: parsed.data.email,
        apiToken: parsed.data.apiToken,
      },
      orgId,
      actorUserId: userId,
      projectKeys: parsed.data.projectKeys,
      includeComments: parsed.data.includeComments ?? true,
      includeWorklog: parsed.data.includeWorklog ?? true,
      dryRun: parsed.data.dryRun ?? false,
      userMappings: parsed.data.userMappings,
    });

    if (!report.ok) {
      return NextResponse.json({ success: false, error: report.error, data: report }, { status: 502 });
    }
    return NextResponse.json({ success: true, data: report });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Migration failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const maxDuration = 300; // 5-min Vercel timeout — best effort for medium sites.
