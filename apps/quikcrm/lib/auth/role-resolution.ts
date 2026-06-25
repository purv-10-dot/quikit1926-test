/**
 * Shared CRM role resolution — the SINGLE source for turning a QuikIT/Membership
 * role (+ optional per-app override) into the legacy CRM role enum the ported
 * code reasons about (`Administrator`, `TeamManager`, `SalesManager`,
 * `SalesUser`, `MarketingUser`, `FinanceUser`).
 *
 * Extracted from lib/auth/require.ts so BOTH call sites use the same logic:
 *   - readSession() (require.ts)            → session.role at request time
 *   - Settings→Users digest eligibility     → a row's role for the toggle
 * If these diverged, UI-eligible could disagree with send-time-eligible.
 *
 * mapRole is moved VERBATIM (behavior-preserving — characterization-tested).
 */

/**
 * Map QuikIT/Membership role strings to the legacy CRM role enum. Anything
 * admin-shaped at the platform level becomes `Administrator` in CRM so existing
 * role checks work.
 */
export function mapRole(membershipRole: string | undefined): string {
  if (!membershipRole) return "SalesUser";
  const r = membershipRole.toLowerCase();
  if (
    r === "admin" ||
    r === "owner" ||
    r === "super_admin" ||
    r === "administrator" ||
    r === "org_admin" ||
    r === "app_admin"
  ) {
    return "Administrator";
  }
  // TeamManager sits above SalesManager in the hierarchy:
  //   Administrator > TeamManager > SalesManager > SalesUser
  // Handles both underscore (OrgMember.role) and hyphen (AppRole.name) variants.
  if (
    r === "team_manager" || r === "team-manager" ||
    r === "teammanager" || r === "team manager" ||
    r === "regional_director"
  ) return "TeamManager";
  // AppRole.name uses "sales-manager"; OrgMember.role uses "sales_manager" / "manager".
  if (r === "manager" || r === "sales_manager" || r === "salesmanager" || r === "sales-manager")
    return "SalesManager";
  // AppRole.name uses "marketing-user"; OrgMember.role uses "marketing_user" / "marketing".
  if (r === "marketing" || r === "marketing_user" || r === "marketinguser" || r === "marketing-user")
    return "MarketingUser";
  // AppRole.name uses "finance-user"; OrgMember.role uses "finance_user" / "finance".
  if (r === "finance" || r === "finance_user" || r === "financeuser" || r === "finance-user")
    return "FinanceUser";
  // member / user / "sales-user" / anything else → SalesUser (the broad CRM default).
  return "SalesUser";
}

/**
 * Resolve a user's effective CRM role from their org-membership role plus an
 * optional per-app (QuikCRM) UserAppAccess role. Mirrors readSession exactly:
 * the app-access role OVERRIDES the membership role only when it is set AND is
 * something other than the default "member" (a stray non-CRM "member" app row
 * must never downgrade an org admin).
 *
 * NOTE: appAccessRole MUST already be the role for the QuikCRM app specifically.
 * Callers that batch-fetch UserAppAccess MUST filter by the quikcrm appId
 * (getQuikCrmAppId()) — passing a stray other-app row here would mis-resolve
 * (this resolver cannot detect a wrong-app role; it trusts its input).
 */
export function resolveCrmRole(input: {
  membershipRole: string | undefined;
  appAccessRole: string | null | undefined;
}): string {
  const { membershipRole, appAccessRole } = input;
  const effectiveRole =
    appAccessRole && appAccessRole !== "member" ? appAccessRole : membershipRole;
  return mapRole(effectiveRole);
}
