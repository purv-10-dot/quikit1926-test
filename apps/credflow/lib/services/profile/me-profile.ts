import { prisma } from "@/lib/db/prisma";
import { registerMember, isConfigured } from "@/lib/services/telephony/india-voice";
import { digitsOnly } from "@/lib/utils/phone-helpers";
import { setAgentPhoneForUser } from "./agent-phone";

export type MeProfileRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

export type TelephonyRegistration = {
  registered: boolean;
  message?: string;
  error?: string;
  skipped?: boolean;
  statusAvailable?: boolean;
  statusMessage?: string;
};

export async function updateMeProfile(opts: {
  userId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}): Promise<{ profile: MeProfileRow; telephony: TelephonyRegistration | null }> {
  const existing = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true },
  });
  if (!existing) {
    const err = new Error("User not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const profile = await prisma.user.update({
    where: { id: opts.userId },
    data: {
      firstName: opts.firstName,
      lastName: opts.lastName,
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const rawPhone = opts.phone?.trim() ?? "";
  if (!rawPhone) {
    await setAgentPhoneForUser(opts.tenantId, opts.userId, null);
    return { profile, telephony: null };
  }

  const num = digitsOnly(rawPhone);
  if (num.length < 10) {
    const err = new Error("Mobile must have at least 10 digits") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  await setAgentPhoneForUser(opts.tenantId, opts.userId, num);

  if (!isConfigured()) {
    return {
      profile,
      telephony: {
        registered: false,
        skipped: true,
        message:
          "Mobile saved. Telephony is not configured (set RP_DIGITAL_AUTHCODE and RP_DIGITAL_DESKPHONE to register with IndiaVoice).",
      },
    };
  }

  const memberName =
    `${opts.firstName} ${opts.lastName}`.trim() || profile.email?.split("@")[0] || "Agent";

  try {
    const result = await registerMember(memberName, num);
    const statusSync = result.workingStatus;
    const statusAvailable = statusSync?.ok === true;
    let message = result.message ?? "Member registered with IndiaVoice";
    if (statusAvailable && !statusSync?.skipped) {
      message = `${message}. Agent status set to Ready (outbound enabled).`;
    } else if (statusSync && !statusSync.ok && !statusSync.skipped) {
      message = `${message}. Status sync warning: ${statusSync.message ?? "could not set Ready"}.`;
    }
    return {
      profile,
      telephony: {
        registered: true,
        message,
        statusAvailable,
        statusMessage: statusSync?.message,
      },
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "IndiaVoice member registration failed";
    return {
      profile,
      telephony: {
        registered: false,
        error: message,
      },
    };
  }
}
