import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/withAuth";
import { canViewAllTeams, getTeamFilter } from "@/lib/rbac";

// GET /api/connected-accounts — team-scoped list of connected accounts, using
// the same scoping rules as /api/dashboards. The filter is applied in the
// Prisma `where`, never post-fetch.
//
// NOTE: `credentials` (OAuth tokens / API keys) are deliberately NOT selected —
// they must never leave the server.
export const GET = withAuth(async (req) => {
  const role = req.session.user.role;

  let where: { teamId?: string } | undefined;
  if (canViewAllTeams(role)) {
    // View-all roles may narrow to one team via ?teamId= (admin team switcher);
    // omitting it returns all teams. Still a server-side scope.
    const teamId = req.nextUrl.searchParams.get("teamId");
    where = teamId ? { teamId } : undefined;
  } else {
    const filter = getTeamFilter(req.session);
    if (!filter) return NextResponse.json({ connectedAccounts: [] });
    where = { teamId: filter.teamId };
  }

  const connectedAccounts = await prisma.connectedAccount.findMany({
    where,
    select: {
      id:          true,
      userId:      true,
      teamId:      true,
      provider:    true,
      accountName: true,
      createdAt:   true,
      // Who connected it — powers the team-lead "who connected what" list.
      user:        { select: { name: true, email: true } },
      // credentials intentionally omitted
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ connectedAccounts });
}, "analytics.view_own_team");

// POST /api/connected-accounts — connect an account for the caller's team.
// Body: { provider, accountName }
// The account is stamped with the user's teamId (team-owned, not user-owned).
// Guarded by the "account.connect" permission (every role except VIEWER).
export const POST = withAuth(async (req) => {
  let provider: string;
  let accountName: string;
  try {
    const body = (await req.json()) as { provider?: unknown; accountName?: unknown };
    if (typeof body.provider !== "string" || !body.provider.trim()) {
      return NextResponse.json({ error: "provider is required" }, { status: 400 });
    }
    if (typeof body.accountName !== "string" || !body.accountName.trim()) {
      return NextResponse.json({ error: "accountName is required" }, { status: 400 });
    }
    provider = body.provider.trim();
    accountName = body.accountName.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Team-owned: stamp the account with the user's team at creation time.
  const teamId = req.session.user.teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "You must be assigned to a team before connecting an account" },
      { status: 400 }
    );
  }

  const account = await prisma.connectedAccount.create({
    data: {
      userId:      req.session.user.id,
      teamId,
      provider,
      accountName,
      credentials: {}, // placeholder — real OAuth tokens/keys are stored later
    },
    select: { id: true, provider: true, accountName: true, teamId: true, createdAt: true },
  });

  return NextResponse.json({ connectedAccount: account }, { status: 201 });
}, "account.connect");
