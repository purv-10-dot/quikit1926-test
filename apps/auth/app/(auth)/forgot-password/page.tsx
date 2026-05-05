import { redirect } from "next/navigation";

/**
 * Legacy route. Forgot-password is now an inline step in the sign-in flow
 * at /login (click "Forgot password?" after entering email + password).
 * Permanent redirect so old bookmarks don't 404.
 */
export default function ForgotPasswordPage() {
  redirect("/login");
}
