import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { updateNotificationSettingsSchema } from "@/lib/validation/settings";

export const GET = withOrgAuth(
  async ({ userId }) => {
    // No row exists until the user first visits this page or changes a
    // setting — upsert-on-read so the response always reflects the actual
    // defaults rather than 404ing for every user who has never touched this
    // page. emailInstantEnabled is set to true here (NOT the Prisma column
    // default of false) because email notifications predate this preference
    // entirely — everyone already got every email, so a first-ever row must
    // represent "unchanged from today," not silently opt new users out.
    const settings = await db.qtUserNotificationSetting.upsert({
      where: { userId },
      create: { userId, emailInstantEnabled: true },
      update: {},
      select: { inAppEnabled: true, emailInstantEnabled: true },
    });
    return NextResponse.json({ success: true, data: settings });
  },
  { fallbackErrorMessage: "Failed to fetch notification settings" },
);

export const PATCH = withOrgAuth(
  async ({ userId }, request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = updateNotificationSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const updated = await db.qtUserNotificationSetting.upsert({
      where: { userId },
      create: { userId, ...parsed.data },
      update: parsed.data,
      select: { inAppEnabled: true, emailInstantEnabled: true },
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { fallbackErrorMessage: "Failed to update notification settings" },
);
