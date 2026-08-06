/**
 * Launcher zone layout — loads the marketing brand typeface stack
 * (Inter + DM Serif Display) so the authenticated launcher reads as the
 * same product as the public marketing site. Scoped to (launcher) routes;
 * the app root layout owns <html>/<body>/Providers.
 *
 * No Contact Support widget here, deliberately. The launcher is a chooser, not
 * a workspace — support lives inside each app, where a user is actually doing
 * the work they need help with. Mounting it here as well put a second floating
 * button on a screen that is mostly app tiles.
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
    </>
  );
}
