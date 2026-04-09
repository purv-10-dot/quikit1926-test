"use client";

import { SignInComponent } from "@/components/ui/sign-in";
import { Gem } from "lucide-react";
import { useSearchParams } from "next/navigation";

const LogoComponent = () => (
  <div className="bg-primary text-primary-foreground rounded-md p-1.5">
    <Gem className="h-4 w-4" />
  </div>
);

const REASON_MESSAGES: Record<string, string> = {
  deactivated: "Your membership has been deactivated by an administrator.",
  app_revoked: "Your app access has been revoked. Contact your org admin.",
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
