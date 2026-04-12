"use client";

import { SignInComponent } from "@quikit/ui";
import { useSearchParams } from "next/navigation";

const LogoComponent = () => (
  <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl p-2">
    <span className="text-lg font-bold">Q</span>
  </div>
);

const REASON_MESSAGES: Record<string, string> = {
  deactivated: "Your membership has been deactivated by an administrator.",
  app_revoked: "Your app access has been revoked. Contact your org admin.",
  unauthorized: "You don't have permission to access that page.",
};

export default function LoginPage() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const message = reason ? REASON_MESSAGES[reason] : null;

  return (
    <div className="relative">
      {message && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center px-4 py-3 bg-amber-500/90 backdrop-blur-sm">
          <p className="text-sm font-medium text-black">{message}</p>
        </div>
      )}
      <SignInComponent logo={<LogoComponent />} brandName="QuikIT" />
    </div>
  );
}
