import { redirect } from 'next/navigation';

/**
 * The dev role-picker is retired under centralized auth. Existing links
 * ("Switch account…", the API 401 handler, etc.) still point here, so we keep
 * the route as a thin redirect into the SSO login flow.
 *
 * TODO(phase-4): replace the AppShell "Switch account" affordance with the
 * platform app-switcher + global sign-out, and remove this shim.
 */
export default function RoleSelectRedirect() {
  redirect('/login');
}
