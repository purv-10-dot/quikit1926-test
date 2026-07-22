import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { buildLoginUrl } from "@quikit/shared/login-url";
import { MessageSquare, Phone, CalendarDays, Bell } from "lucide-react";
import { authOptions } from "@/lib/auth";

/**
 * Sign In → central QuikAuth /login with a callbackUrl back to this app's
 * /dashboard (same helper every app's landing uses). Sign Up → the central
 * QuikAuth /register wizard. Literal NEXT_PUBLIC_* access so webpack inlines
 * the values at build time.
 */
const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKCHAT_URL ?? "http://localhost:3011",
  postLoginPath: "/dashboard",
});
const SIGNUP_HREF = `${(process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001").replace(
  /\/$/,
  "",
)}/register`;

/**
 * Public landing page at `/` (standard QuikIT app flow).
 *
 *   - Unauthenticated → render the landing page (200 OK).
 *   - Authenticated   → redirect to `/dashboard` (the workspace).
 *
 * Middleware lets `/` through (it's in publicRoutes). A user bounced here for
 * lacking app access (`?reason=no_app_access`) still holds a session, so we
 * must NOT redirect them — they see the landing + the access-denied popup.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) {
    redirect("/dashboard");
  }

  const features = [
    { icon: MessageSquare, title: "Channels & DMs", body: "Organized conversations for every team, project, and 1:1." },
    { icon: Phone, title: "Calls & meetings", body: "Start an audio or video call from any channel in one click." },
    { icon: CalendarDays, title: "Shared calendar", body: "Schedule meetings and keep the team in sync." },
    { icon: Bell, title: "Smart notifications", body: "Keyword alerts, per-channel levels, and do-not-disturb." },
  ];

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
    >
      <AppAccessDeniedPopup appName="QuikChat" />

      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-white">
            <MessageSquare className="h-5 w-5" />
          </span>
          QuikChat
        </div>
        <div className="flex items-center gap-2">
          <a
            href={LOGIN_HREF}
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
          >
            Sign In
          </a>
          <a
            href={SIGNUP_HREF}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-secondary)]"
          >
            Sign Up
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Real-time team messaging, built into QuikIT
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--color-text-secondary)]">
          Channels, direct messages, calls, and meetings — all in one place, with
          your QuikIT single sign-on.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href={LOGIN_HREF}
            className="rounded-lg bg-accent-600 px-6 py-3 text-sm font-medium text-white hover:bg-accent-700"
          >
            Sign In
          </a>
          <a
            href={SIGNUP_HREF}
            className="rounded-lg border border-[var(--color-border)] px-6 py-3 text-sm font-medium hover:bg-[var(--color-bg-secondary)]"
          >
            Sign Up
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-100 text-accent-700">
              <f.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-[var(--color-border)] px-6 py-8 text-center text-sm text-[var(--color-text-secondary)]">
        © {new Date().getFullYear()} QuikIT · QuikChat
      </footer>
    </main>
  );
}
