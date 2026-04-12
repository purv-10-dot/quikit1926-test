import { redirect } from "next/navigation";

/**
 * QuikScale login — redirects to QuikIT gateway.
 *
 * Login now lives in apps/quikit. If someone navigates directly to
 * /login on QuikScale, redirect them to the platform login.
 * When QUIKIT_URL is not set (backward compat), show the old login.
 */
export default function LoginPage() {
  const quikitUrl = process.env.QUIKIT_URL;
  if (quikitUrl) {
    redirect(`${quikitUrl}/login`);
  }

  // Fallback: if QUIKIT_URL not set, redirect to NextAuth default
  redirect("/api/auth/signin");
}
