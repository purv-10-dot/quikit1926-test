import { LOGIN_HREF } from "./login-href";

export function FooterCTA() {
  return (
    <section id="reports" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="rounded-3xl bg-[var(--qa-ink)] px-6 py-14 text-center text-white sm:px-12">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to take control of your assets?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm text-white/70 sm:text-base">
          Sign in with your QuikIT account — QuikAsset uses your organization&apos;s
          single sign-on and role permissions.
        </p>
        <a
          href={LOGIN_HREF}
          className="mt-8 inline-flex rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[var(--qa-ink)] hover:bg-white/90"
        >
          Log in to QuikAsset
        </a>
      </div>
      <p className="mt-10 text-center text-xs text-[var(--qa-muted)]">
        © {new Date().getFullYear()} QuikAsset · part of the QuikIT platform
      </p>
    </section>
  );
}
