"use client";
import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") void signIn("quikit", { callbackUrl: "/" });
    if (status === "authenticated") router.replace("/");
  }, [status, router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Redirecting to sign-in…</p>
    </div>
  );
}
