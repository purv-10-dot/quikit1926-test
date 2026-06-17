// Multi-tenant guard helpers. Every Prisma query in a route handler should
// be scoped by orgId — these helpers make that enforcement uniform.

export type OrgScope = { orgId: string };

export function whereOrg<T extends Record<string, unknown>>(
  orgId: string,
  rest?: T,
): T & OrgScope {
  return { orgId, ...(rest ?? {}) } as T & OrgScope;
}

export function dataOrg<T extends Record<string, unknown>>(
  orgId: string,
  rest: T,
): T & OrgScope {
  return { orgId, ...rest };
}
