/**
 * Per-user UI preferences (S14b). Currently just `theme`; get-or-create + patch,
 * org-scoped, mirroring the notification-settings pattern.
 */
import { db as prisma } from "@quikit/database";
import type { OrgContext, ThemePref, UiPrefsDto } from "@/lib/shared";

const THEMES: ThemePref[] = ["system", "light", "dark"];
export const isThemePref = (v: unknown): v is ThemePref =>
  typeof v === "string" && (THEMES as string[]).includes(v);

function toDto(row: { theme: string }): UiPrefsDto {
  return { theme: isThemePref(row.theme) ? row.theme : "system" };
}

export async function getUiPrefs(ctx: OrgContext): Promise<UiPrefsDto> {
  const existing = await prisma.qcUserUiPrefs.findUnique({
    where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
  });
  if (existing) return toDto(existing);
  try {
    return toDto(
      await prisma.qcUserUiPrefs.create({ data: { orgId: ctx.orgId, userId: ctx.userId } }),
    );
  } catch {
    return toDto(
      await prisma.qcUserUiPrefs.findUniqueOrThrow({
        where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
      }),
    );
  }
}

export async function setUiPrefs(
  ctx: OrgContext,
  patch: { theme?: ThemePref },
): Promise<UiPrefsDto> {
  await getUiPrefs(ctx); // ensure the row exists
  const data: { theme?: ThemePref } = {};
  if (patch.theme && isThemePref(patch.theme)) data.theme = patch.theme;
  const row = await prisma.qcUserUiPrefs.update({
    where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
    data,
  });
  return toDto(row);
}
