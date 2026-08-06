import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { mapMembershipToCrmRole } from "@/lib/auth/require";
import { patchMeSchema } from "@/lib/validators/auth-me";
import { getAgentPhoneForUser } from "@/lib/services/profile/agent-phone";
import { updateMeProfile } from "@/lib/services/profile/me-profile";

type MeProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

function toMeUser(
  profile: MeProfile,
  orgId: string,
  membershipRole: string | undefined,
  phone: string | null,
) {
  return {
    id: profile.id,
    tenantId: orgId,
    email: profile.email ?? "",
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone,
    role: mapMembershipToCrmRole(membershipRole),
  };
}

function apiError(err: unknown): NextResponse {
  const e = err as { statusCode?: number; message?: string };
  const status = e?.statusCode && Number.isInteger(e.statusCode) ? e.statusCode : 500;
  const message = e?.message || "Internal Server Error";
  if (status >= 500) console.error("[api/auth/me]", err);
  return NextResponse.json({ error: message }, { status });
}

/**
 * Client `refreshMe()` — returns the current dashboard user shape or 401.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const phone = await getAgentPhoneForUser(session.user.orgId, session.user.id);

    return NextResponse.json({
      user: toMeUser(profile, session.user.orgId, session.user.membershipRole, phone),
    });
  } catch (e: unknown) {
    return apiError(e);
  }
}

/** Settings → My Profile — update name, mobile, and IndiaVoice member (addmember_v2). */
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = patchMeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { profile, telephony } = await updateMeProfile({
      userId: session.user.id,
      tenantId: session.user.orgId,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone ?? null,
    });

    const phone = await getAgentPhoneForUser(session.user.orgId, session.user.id);

    return NextResponse.json({
      user: toMeUser(profile, session.user.orgId, session.user.membershipRole, phone),
      telephony,
    });
  } catch (e: unknown) {
    return apiError(e);
  }
}
