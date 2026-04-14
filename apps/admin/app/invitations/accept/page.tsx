"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button, Input } from "@quikit/ui";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface InvitationData {
  orgName: string;
  orgLogo: string | null;
  orgColor: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  needsPassword: boolean;
}

export default function AcceptInvitationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided");
      setLoading(false);
      return;
    }

    async function fetchInvitation() {
      const res = await fetch(`/api/invitations/accept?token=${token}`);
      const json = await res.json();
      if (json.success) {
        setInvitation(json.data);
      } else {
        setError(json.error || "Invalid invitation");
      }
      setLoading(false);
    }
    fetchInvitation();
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();

    if (invitation?.needsPassword) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setAccepting(true);
    setError("");

    const res = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password: invitation?.needsPassword ? password : undefined,
      }),
    });

    const json = await res.json();
    if (json.success) {
      setAccepted(true);
    } else {
      setError(json.error || "Failed to accept invitation");
    }
    setAccepting(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" />
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)]">
        <Card className="w-full max-w-md text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-[var(--color-success)] mb-4" />
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
            Welcome to {invitation?.orgName}!
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Your invitation has been accepted. You can now sign in.
          </p>
          <Button onClick={() => router.push("/login")} className="w-full">
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)]">
        <Card className="w-full max-w-md text-center">
          <XCircle className="h-12 w-12 mx-auto text-[var(--color-danger)] mb-4" />
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
            Invalid Invitation
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)]">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center h-12 w-12 rounded-xl text-white font-bold text-lg mb-4"
            style={{ backgroundColor: invitation?.orgColor || "#6366f1" }}
          >
            {invitation?.orgName?.charAt(0)?.toUpperCase()}
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
            Join {invitation?.orgName}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            You&apos;ve been invited as{" "}
            <Badge variant={invitation?.role}>
              {ROLE_LABELS[invitation?.role || ""] || invitation?.role}
            </Badge>
          </p>
        </div>

        <form onSubmit={handleAccept} className="space-y-4">
          <div className="rounded-lg bg-[var(--color-bg-secondary)] p-3 text-sm">
            <p className="text-[var(--color-text-secondary)]">
              <strong className="text-[var(--color-text-primary)]">{invitation?.firstName} {invitation?.lastName}</strong>
              <br />
              {invitation?.email}
            </p>
          </div>

          {invitation?.needsPassword && (
            <>
              <Input
                id="password"
                label="Create Password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                id="confirm-password"
                label="Confirm Password"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </>
          )}

          {error && (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          )}

          <Button type="submit" className="w-full" loading={accepting}>
            Accept Invitation
          </Button>
        </form>
      </Card>
    </div>
  );
}
