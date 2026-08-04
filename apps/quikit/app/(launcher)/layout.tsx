import { SupportLauncher } from "@quikit/ui/support";

/**
 * Launcher zone layout — loads the marketing brand typeface stack
 * (Inter + DM Serif Display) so the authenticated launcher reads as the
 * same product as the public marketing site. Scoped to (launcher) routes;
 * the app root layout owns <html>/<body>/Providers.
 *
 * The Contact Support widget is mounted HERE rather than only inside the
 * individual apps: the launcher is where a user lands when an app won't let
 * them in, so it is the one screen someone with no app access at all can still
 * reach us from.
 */
export default function LauncherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=DM+Serif+Display:ital@0;1&display=swap"
      />
      {children}
      <SupportLauncher appSlug="quikit" />
    </>
  );
}
