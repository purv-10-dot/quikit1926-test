import type { InviteMethod } from "@quikit/shared";

const ROLE_TEMPLATE_ALIASES: Record<string, string[]> = {
  Administrator: ["administrator", "admin"],
  SalesManager: ["sales manager", "salesmanager", "manager"],
  SalesUser: ["sales user", "salesuser", "sales"],
  MarketingUser: ["marketing user", "marketinguser", "marketing"],
  FinanceUser: ["finance user", "financeuser", "finance"],
};

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function resolveTemplateIdsForRole(
  role: string,
  explicitIds: string[],
  templates: { id: string; name: string }[],
): string[] {
  if (explicitIds.length > 0) return explicitIds;
  if (templates.length === 0) return [];

  const aliases = ROLE_TEMPLATE_ALIASES[role] ?? [role.replace(/([A-Z])/g, " $1").trim().toLowerCase()];
  const hit = templates.find((t) => {
    const n = t.name.trim().toLowerCase();
    return aliases.some((a) => n === a || n.includes(a));
  });
  // No role-name match → assign no template. The user still gets their role's
  // in-code baseline; silently attaching the alphabetically-first template
  // (the old behaviour) risked granting a mismatched, possibly broader scope.
  return hit ? [hit.id] : [];
}

export function shouldSendInviteEmail(opts: {
  linkExistingUserId?: string | null;
  invitationToken: string | null;
}): boolean {
  return !opts.linkExistingUserId && Boolean(opts.invitationToken);
}

export function inviteAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_QUIKIT_URL ??
    process.env.QUIKIT_URL ??
    "http://localhost:3001"
  );
}

export type CrmInviteMethod = InviteMethod;
