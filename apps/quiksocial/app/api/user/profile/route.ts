/**
 * /api/user/profile
 *
 * GET   — merged user profile (auth.User + app_quiksocial.UserPreference).
 *         Response shape preserves the legacy keys the frontend reads.
 *
 * PATCH — splits writes by table:
 *           name / avatar / timezone   → auth.User
 *           backgroundImage / defaultPostTime / aiPreferences /
 *           activeBrandId               → app_quiksocial.UserPreference
 *
 * Ported to QuikIT (Phase 3, Batch 5).
 *
 * NOTE: cross-app session sync — the QuikIT OIDC flow's `jwt` callback
 * reads the user once at sign-in. Profile fields updated here won't
 * appear on session.user until the next sign-in. Acceptable interim
 * gap; full session refresh is a follow-up PR.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { isAllowedBg } from "@/lib/constants/background-images";

interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  timezone: string | null;
  country: string | null;
  emailVerified: Date | null;
  isSuperAdmin: boolean;
}

interface UserPref {
  activeBrandId: string | null;
  backgroundImage: string;
  defaultPostTime: string;
  aiPreferences: unknown;
}

function fullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = (name || "").trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const idx = trimmed.indexOf(" ");
  if (idx < 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1).trim(),
  };
}

function buildUser(authUser: AuthUser, pref: UserPref | null) {
  return {
    _id: authUser.id,
    id: authUser.id,
    email: authUser.email,
    name: fullName(authUser.firstName, authUser.lastName),
    firstName: authUser.firstName,
    lastName: authUser.lastName,
    avatar: authUser.avatar,
    timezone: authUser.timezone ?? null,
    country: authUser.country ?? null,
    emailVerified: !!authUser.emailVerified,
    isAdmin: authUser.isSuperAdmin,
    activeBrandId: pref?.activeBrandId ?? null,
    backgroundImage:
      pref?.backgroundImage ?? "New_light_green_background_final.webp",
    defaultPostTime: pref?.defaultPostTime ?? "09:00",
    aiPreferences: pref?.aiPreferences ?? null,
  };
}

const profileSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatar: true,
  timezone: true,
  country: true,
  emailVerified: true,
  isSuperAdmin: true,
} as const;

// ---------------------------------------------------------------------------
// GET /api/user/profile
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const [authUser, pref] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: profileSelect }),
    db.userPreference.findUnique({
      where: { orgId_userId: { orgId, userId } },
    }),
  ]);

  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { user: buildUser(authUser, pref as UserPref | null) },
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/user/profile
// ---------------------------------------------------------------------------
const patchProfileSchema = z
  .object({
    name: z.string().optional(),
    avatar: z.string().nullable().optional(),
    timezone: z.string().optional(),
    backgroundImage: z.string().optional(),
    defaultPostTime: z.string().optional(),
    aiPreferences: z.unknown().optional(),
    activeBrandId: z.string().nullable().optional(),
  })
  .passthrough();

export const PATCH = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = patchProfileSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid body" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const userUpdates: Record<string, unknown> = {};
  const prefUpdates: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const { firstName, lastName } = splitName(body.name);
    if (firstName) userUpdates.firstName = firstName;
    userUpdates.lastName = lastName;
  }
  if (typeof body.avatar === "string" || body.avatar === null) {
    userUpdates.avatar = body.avatar ?? null;
  }
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    userUpdates.timezone = body.timezone.trim();
  }

  if ("backgroundImage" in body) {
    const v = body.backgroundImage;
    if (typeof v === "string" && isAllowedBg(v)) {
      prefUpdates.backgroundImage = v;
    }
  }
  if ("defaultPostTime" in body && typeof body.defaultPostTime === "string") {
    prefUpdates.defaultPostTime = body.defaultPostTime;
  }
  if ("aiPreferences" in body) {
    prefUpdates.aiPreferences = body.aiPreferences ?? null;
  }
  if ("activeBrandId" in body) {
    const v = body.activeBrandId;
    if (typeof v === "string" && v.trim()) {
      prefUpdates.activeBrandId = v.trim();
    } else if (v === null) {
      prefUpdates.activeBrandId = null;
    }
  }

  if (
    Object.keys(userUpdates).length === 0 &&
    Object.keys(prefUpdates).length === 0
  ) {
    return NextResponse.json(
      { success: false, error: "No valid fields to update" },
      { status: 400 },
    );
  }

  if (Object.keys(userUpdates).length > 0) {
    await db.user.update({
      where: { id: userId },
      data: userUpdates,
    });
  }

  if (Object.keys(prefUpdates).length > 0) {
    await db.userPreference.upsert({
      where: { orgId_userId: { orgId, userId } },
      update: prefUpdates,
      create: { orgId, userId, ...prefUpdates },
    });
  }

  // Re-read for a fresh merged view.
  const [authUser, pref] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: profileSelect }),
    db.userPreference.findUnique({
      where: { orgId_userId: { orgId, userId } },
    }),
  ]);

  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { user: buildUser(authUser, pref as UserPref | null) },
  });
});
