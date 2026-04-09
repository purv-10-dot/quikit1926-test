"use client";

import { useEffect } from "react";

const QUIKSCALE_URL = process.env.NEXT_PUBLIC_QUIKSCALE_URL || "http://localhost:3004";

export default function LoginPage() {
  useEffect(() => {
    window.location.href = `${QUIKSCALE_URL}/login`;
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-[var(--color-text-secondary)]">Redirecting to login...</p>
    </div>
  );
}
