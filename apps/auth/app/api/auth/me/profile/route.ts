import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyJWT } from "@quikit/auth/jwt";
import { db } from "@/lib/db";

/**
 * GET /api/auth/me/profile
 *
 * Reports whether the currently signed-in user has filled in their first
 * name and last name. The sign-in component reads this immediately after a
 * successful credentials login to decide whether to advance to an inline
 * "tell us your name" step (when `complete === false`) or redirect straight
 * to the launcher.
 */
export async function GET(req: NextRequest) {
  const token = await verifyJWT(req);
  const userId = token ? ((token.sub ?? token.id) as string | undefined) : undefined;
  if (!token || !userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return NextResponse.json({
    success: true,
    firstName: user.firstName,
    lastName: user.lastName,
    complete: fullName.length > 0,
  });
}

/**
 * PATCH /api/auth/me/profile
 *
 * Updates firstName/lastName for the currently signed-in user. Used by the
 * inline "tell us your name" step in the sign-in component when a user
 * added by a super admin signs in for the first time.
 *
 * Idempotent: subsequent calls just overwrite the fields.
 */
export async function PATCH(req: NextRequest) {
  const token = await verifyJWT(req);
  const userId = token ? ((token.sub ?? token.id) as string | undefined) : undefined;
  if (!token || !userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body must be JSON" }, { status: 400 });
  }

  const { firstName, lastName } = (body ?? {}) as {
    firstName?: unknown;
    lastName?: unknown;
  };

  if (typeof firstName !== "string" || typeof lastName !== "string") {
    return NextResponse.json(
      { success: false, error: "firstName and lastName are required strings" },
      { status: 400 },
    );
  }

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  if (!trimmedFirst || !trimmedLast) {
    return NextResponse.json(
      { success: false, error: "First name and last name cannot be empty" },
      { status: 400 },
    );
  }
  if (trimmedFirst.length > 100 || trimmedLast.length > 100) {
    return NextResponse.json(
      { success: false, error: "First name and last name must be at most 100 characters" },
      { status: 400 },
    );
  }

  try {
    const updated = await db.user.update({
      where: { id: userId },
      data: { firstName: trimmedFirst, lastName: trimmedLast },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return NextResponse.json({ success: true, user: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
