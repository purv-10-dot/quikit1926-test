"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button, Input } from "@quikit/ui";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { CheckCircle, XCircle, Loader2, Check } from "lucide-react";
import { checkPasswordRules, isPasswordValid, PASSWORD_MIN_LENGTH } from "@/lib/passwordPolicy";

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
  const [isExpired, setIsExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

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
        if (res.status === 410) setIsExpired(true);
      }
      setLoading(false);
    }
    fetchInvitation();
  }, [token]);

  async function handleRequestResend() {
    if (!token) return;
    setRequesting(true);
    try {
      const res = await fetch("/api/invitations/request-resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (json.success) setRequestSent(true);
      else setError(json.error || "Failed to request resend");
    } finally {
      setRequesting(false);
    }
  }

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();

    if (invitation?.needsPassword) {
      if (!isPasswordValid(password)) {
        setError("Password does not meet the requirements below");
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
    if (isExpired) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)]">
          <Card className="w-full max-w-md text-center">
            <XCircle className="h-12 w-12 mx-auto text-[var(--color-danger)] mb-4" />
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
              Invitation Expired
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              This invitation link is no longer valid. Click below to ask the
              administrator to send you a fresh invitation.
            </p>
            {requestSent ? (
              <p className="text-sm text-[var(--color-success)]">
                ✓ Your request has been sent. The administrator will follow up shortly.
              </p>
            ) : (
              <Button
                onClick={handleRequestResend}
                loading={requesting}
                className="w-full"
              >
                Request a new invitation
              </Button>
            )}
          </Card>
        </div>
      );
    }
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
                placeholder={`Min ${PASSWORD_MIN_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <PasswordRules password={password} />
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

function PasswordRules({ password }: { password: string }) {
  const r = checkPasswordRules(password);
  const items: { ok: boolean; label: string }[] = [
    { ok: r.minLength, label: `At least ${PASSWORD_MIN_LENGTH} characters` },
    { ok: r.hasLetter, label: "At least one letter" },
    { ok: r.hasDigit, label: "At least one digit" },
    { ok: r.hasSymbol, label: "At least one symbol" },
  ];
  return (
    <ul className="space-y-1 text-xs">
      {items.map((item) => (
        <li
          key={item.label}
          className={
            item.ok
              ? "flex items-center gap-1.5 text-[var(--color-success)]"
              : "flex items-center gap-1.5 text-[var(--color-text-tertiary)]"
          }
        >
          <Check className={`h-3 w-3 ${item.ok ? "opacity-100" : "opacity-30"}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
