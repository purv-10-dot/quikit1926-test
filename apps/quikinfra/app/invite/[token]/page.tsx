import Link from "next/link";

/**
 * GET /invite/[token]
 *
 * Android App Link landing page for native invite acceptance. When the
 * QuikInfra app is installed, Android intercepts this URL before it ever
 * reaches the browser (see /.well-known/assetlinks.json) and opens the
 * native invite screen directly — this page never renders in that case.
 *
 * When the app is NOT installed, this renders as a plain web fallback:
 * fetches the same invite details the existing web accept page uses, and
 * links to that existing (unchanged) accept flow. No new invitation
 * business logic lives here — it's a thin wrapper around the existing
 * `GET/POST /api/invitations/accept` contract, so expiry, single-use, and
 * identity-match rules stay exactly where they already are.
 */

interface InviteDetails {
  orgName: string;
  role: string;
}

function authBase(): string {
  return (process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001").replace(
    /\/$/,
    "",
  );
}

async function fetchInvite(
  token: string,
): Promise<{ ok: true; data: InviteDetails } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${authBase()}/api/invitations/accept?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const body = (await res.json()) as {
      success: boolean;
      data?: InviteDetails;
      error?: string;
    };
    if (!res.ok || !body.success || !body.data) {
      return { ok: false, error: body.error ?? "Invalid or expired invitation" };
    }
    return { ok: true, data: body.data };
  } catch {
    return { ok: false, error: "Couldn't reach the invitation service" };
  }
}

export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const webAcceptUrl = `${authBase()}/invitations/accept?token=${encodeURIComponent(params.token)}`;
  const result = await fetchInvite(params.token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)] px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        {result.ok ? (
          <>
            <h1 className="text-xl font-semibold text-gray-900">
              You&apos;re invited to {result.data.orgName}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Continue on the web to accept and set up your account.
            </p>
            <Link
              href={webAcceptUrl}
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-700"
            >
              Accept invitation
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-gray-900">
              This invitation link isn&apos;t valid
            </h1>
            <p className="mt-2 text-sm text-gray-500">{result.error}</p>
          </>
        )}
      </div>
    </main>
  );
}
