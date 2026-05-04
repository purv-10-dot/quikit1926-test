"use client";

import { useSearchParams } from "next/navigation";
import { SignInComponent } from "@quikit/ui";

const REASON_MESSAGES: Record<string, string> = {
  deactivated: "Your membership has been deactivated by an administrator.",
  app_revoked: "Your app access has been revoked. Contact your org admin.",
  unauthorized: "You don't have permission to access that page.",
  session_expired: "Your session expired. Please sign in again.",
};

export default function LoginPage() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const callbackUrl = params.get("callbackUrl");
  const initialError = reason ? REASON_MESSAGES[reason] ?? null : null;

  return (
    <SignInComponent
      brandName="QuikIT"
      redirectPath="/select-org"
      callbackUrl={callbackUrl}
      initialError={initialError}
      hardNavigate
    />
  );
}
