/**
 * App manifest — required for every QuikIT app.
 *
 * The launcher (apps/quikit) reads each app's manifest at build time to
 * generate its app grid + permissions list. Keep this file static (no
 * runtime work). The integration owner verifies the manifest during
 * integration; do not edit fields after the integration owner has
 * signed off (rename/delete the app instead).
 */
export interface AppManifest {
  /** Stable kebab-case id. Used in URLs, audit logs, feature flags. */
  appId: string;
  /** Human-readable name shown in the launcher grid. */
  name: string;
  /** One-line description shown on hover in the launcher. */
  description: string;
  /** Route prefix this app owns at the platform level (e.g. "/social"). */
  routePrefix: string;
  /** Lucide icon name used in the launcher tile. */
  icon: string;
  /**
   * Permissions this app reads/writes — must match `Permission` enum in
   * @quikit/shared. Devs MUST NOT invent new permission strings; coordinate
   * with the integration owner first.
   */
  permissions: string[];
  /**
   * Top-level navigation entries surfaced in the app sidebar. Order matters.
   * Each entry corresponds to a route under `routePrefix`.
   */
  navigation: { label: string; href: string; icon: string }[];
}

const manifest: AppManifest = {
  appId: "quikchat",
  name: "QuikChat",
  description: "Real-time team messaging on QuikIT.",
  routePrefix: "/chat",
  icon: "MessageSquare",
  // Enforced (resource, action) pairs — kept in sync with the RBAC registry
  // (lib/authz/permissionsRegistry.ts). Static list (no runtime import) so the
  // launcher can read this file at build time.
  permissions: [
    "quikchat.channel.view",
    "quikchat.channel.create",
    "quikchat.channel.update",
    "quikchat.channel.delete",
    "quikchat.channel.public.create",
    "quikchat.channel.dm.create",
    "quikchat.channel.moderate.update",
    "quikchat.channel.moderate.delete",
    "quikchat.channel.inviteexternal.create",
    "quikchat.call.create",
    "quikchat.call.group.create",
    "quikchat.assistant.view",
    "quikchat.assistant.create",
    "quikchat.assistant.ingestprivate.create",
    "quikchat.assistant.ingestorg.create",
    "quikchat.assistant.configure.update",
    "quikchat.app.modules.update",
  ],
  navigation: [{ label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" }],
};

export default manifest;
