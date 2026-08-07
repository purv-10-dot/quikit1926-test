import { prisma } from "@/lib/db/prisma";
import { digitsOnly } from "@/lib/utils/phone-helpers";

const SETTINGS_KEY = "telephonyAgentPhones";

type SettingsTree = {
  [SETTINGS_KEY]?: Record<string, string>;
  [k: string]: unknown;
};

/** Agent mobile for click-to-call (Party A), keyed by userId in workspace settings. */
export async function getAgentPhoneForUser(
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const row = await prisma.qcfOrgWorkspaceSettings.findUnique({ where: { tenantId } });
  const tree = (row?.settings as SettingsTree | null) ?? {};
  const phone = tree[SETTINGS_KEY]?.[userId];
  return typeof phone === "string" && phone.length > 0 ? phone : null;
}

export async function setAgentPhoneForUser(
  tenantId: string,
  userId: string,
  phone: string | null,
): Promise<void> {
  const normalized = phone ? digitsOnly(phone) : "";
  const row = await prisma.qcfOrgWorkspaceSettings.findUnique({ where: { tenantId } });
  const tree = ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
  const phones = { ...(tree[SETTINGS_KEY] ?? {}) };

  if (normalized.length >= 10) {
    phones[userId] = normalized;
  } else {
    delete phones[userId];
  }

  const settings: SettingsTree = { ...tree, [SETTINGS_KEY]: phones };
  if (row) {
    await prisma.qcfOrgWorkspaceSettings.update({
      where: { tenantId },
      data: { settings: settings as object },
    });
  } else {
    await prisma.qcfOrgWorkspaceSettings.create({
      data: { tenantId, settings: settings as object },
    });
  }
}
