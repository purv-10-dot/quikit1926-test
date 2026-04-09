"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <Card className="w-full max-w-md">
      <div className="flex flex-col items-center mb-6">
        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-secondary-light)] mb-4">
          <Shield className="h-6 w-6 text-[var(--color-secondary)]" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Super Admin Portal
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Sign in to manage the platform
        </p>
      </div>

      {reason === "unauthorized" && (
        <div className="mb-4 rounded-lg bg-[var(--color-danger-light)] px-4 py-3 text-sm text-[var(--color-danger-dark)]">
          Super admin access required. You do not have permission to access this portal.
        </div>
      )}

      {reason === "deactivated" && (
        <div className="mb-4 rounded-lg bg-[var(--color-warning-light)] px-4 py-3 text-sm text-[var(--color-warning-dark)]">
          Your account has been deactivated. Please contact another super admin for assistance.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label="Email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          id="password"
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="text-sm text-[var(--color-danger)] text-center">{error}</p>
        )}

        <Button type="submit" className="w-full" loading={loading}>
          Sign In
        </Button>
      </form>
    </Card>
  );
}
