"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import {
  CheckCircle2,
  XCircle,
  Mail,
  Building2,
  Shield,
  User as UserIcon,
  Loader2,
} from "lucide-react";

interface InvitePreview {
  valid: true;
  email: string;
  assignments: Array<{ workspace: string; role: "admin" | "member" }>;
}

interface InviteError {
  valid: false;
  error: string;
  code?: string;
}

const DEFAULT_BG = "/images/New_light_green_background_final.webp";

// useSearchParams() requires a Suspense boundary on the build target. The
// default export below wraps this component; AcceptInviteContent owns the
// actual UI + hook calls.
function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params?.get("token") ?? "";
  const { data: session, status: authStatus } = useSession();

  const [preview, setPreview] = useState<InvitePreview | InviteError | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Verify the token on mount.
  useEffect(() => {
    if (!token) {
      setPreview({ valid: false, error: "No invitation token provided.", code: "NO_TOKEN" });
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/invite/accept?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = unwrap(await r.json().catch(() => ({})));
        if (cancelled) return;
        if (r.ok && data?.valid) {
          setPreview(data as InvitePreview);
        } else {
          setPreview({
            valid: false,
            error: data?.error || "This invitation is invalid.",
            code: data?.code,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview({ valid: false, error: "Network error. Please try again.", code: "NETWORK" });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const data = unwrap(await res.json().catch(() => ({})));
      if (!res.ok) {
        setAcceptError(data?.error || "Failed to accept invitation.");
        return;
      }
      router.replace(data?.redirectTo || "/dashboard");
    } catch {
      setAcceptError("Network error. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  // Build the callback URL so login/signup come back here after auth.
  const callbackUrl =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "";

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        overflow: "hidden",
      }}
    >
      {/* Background — same wallpaper as the dashboard. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: `url(${DEFAULT_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Card — primary glass per design-tokens.md */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "min(480px, 96vw)",
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          padding: 32,
        }}
      >
        {loadingPreview ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Loader2
              size={28}
              style={{
                color: "rgba(255,255,255,0.55)",
                animation: "qs-spin 1s linear infinite",
              }}
            />
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, margin: 0 }}>
              Verifying invitation…
            </p>
            <style>{`@keyframes qs-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : preview && !preview.valid ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(239,68,68,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <XCircle size={28} color="#EF4444" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: "#ffffff", margin: 0 }}>
              Invitation unavailable
            </h1>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              {preview.error}
            </p>
            <Link
              href="/login"
              style={{
                marginTop: 8,
                padding: "10px 22px",
                borderRadius: 10,
                background: "#ffffff",
                color: "#0a0a0a",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Go to login
            </Link>
          </div>
        ) : preview && preview.valid ? (
          <>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(34,197,94,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px",
                }}
              >
                <Mail size={26} color="#22C55E" />
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: "#ffffff", margin: 0 }}>
                You've been invited
              </h1>
              <p
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 13,
                  margin: "6px 0 0",
                  lineHeight: 1.6,
                }}
              >
                <strong style={{ color: "#ffffff" }}>{preview.email}</strong>
              </p>
            </div>

            {/* Workspace assignments */}
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 18,
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.45)",
                  margin: "0 0 8px",
                }}
              >
                Assigned workspaces
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {preview.assignments.map((a, i) => (
                  <div
                    key={`${a.workspace}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        color: "rgba(255,255,255,0.85)",
                        fontSize: 13,
                      }}
                    >
                      <Building2 size={13} style={{ color: "rgba(255,255,255,0.55)" }} />
                      {a.workspace}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "3px 10px",
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          a.role === "admin" ? "#ffffff" : "rgba(255,255,255,0.10)",
                        color: a.role === "admin" ? "#0a0a0a" : "#ffffff",
                        textTransform: "capitalize",
                      }}
                    >
                      {a.role === "admin" ? <Shield size={11} /> : <UserIcon size={11} />}
                      {a.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA region — branches on auth state. */}
            {acceptError && (
              <p style={{ color: "#EF4444", fontSize: 12, marginBottom: 10, textAlign: "center" }}>
                {acceptError}
              </p>
            )}

            {authStatus === "loading" ? (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <Loader2
                  size={22}
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    animation: "qs-spin 1s linear infinite",
                  }}
                />
              </div>
            ) : session?.user?.email ? (
              session.user.email.toLowerCase() === preview.email.toLowerCase() ? (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={accepting}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 10,
                    border: "none",
                    background: "#ffffff",
                    color: "#0a0a0a",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: accepting ? "not-allowed" : "pointer",
                    opacity: accepting ? 0.7 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                  }}
                >
                  {accepting ? (
                    <Loader2 size={15} style={{ animation: "qs-spin 1s linear infinite" }} />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  {accepting ? "Accepting…" : "Accept Invitation"}
                </button>
              ) : (
                <div
                  style={{
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.30)",
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <p style={{ color: "#F59E0B", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                    You're signed in as{" "}
                    <strong style={{ color: "#ffffff" }}>{session.user.email}</strong>, but this
                    invite is for{" "}
                    <strong style={{ color: "#ffffff" }}>{preview.email}</strong>. Sign out and
                    sign in with the invited account to accept.
                  </p>
                  <button
                    type="button"
                    onClick={() => signIn(undefined, { callbackUrl })}
                    style={{
                      marginTop: 10,
                      padding: "8px 16px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.20)",
                      background: "rgba(255,255,255,0.10)",
                      color: "#ffffff",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Switch account
                  </button>
                </div>
              )
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 12,
                    margin: "0 0 4px",
                    textAlign: "center",
                  }}
                >
                  Sign up or log in with{" "}
                  <strong style={{ color: "#ffffff" }}>{preview.email}</strong> to accept.
                </p>
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 10,
                    background: "#ffffff",
                    color: "#0a0a0a",
                    fontSize: 14,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textDecoration: "none",
                  }}
                >
                  Log in to accept
                </Link>
                <Link
                  href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}&email=${encodeURIComponent(preview.email)}`}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.10)",
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 500,
                    border: "1px solid rgba(255,255,255,0.20)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textDecoration: "none",
                  }}
                >
                  Sign up to accept
                </Link>
              </div>
            )}
            <style>{`@keyframes qs-spin { to { transform: rotate(360deg); } }`}</style>
          </>
        ) : null}
      </div>
    </div>
  );
}

// Minimal full-page fallback shown while the search-params subscription
// resolves. Matches the wallpaper background of the real page so there's
// no flash of unstyled content during prerender.
const DEFAULT_BG_IMG = "/images/New_light_green_background_final.webp";
function AcceptInviteFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: `url(${DEFAULT_BG_IMG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <Loader2
        size={28}
        style={{
          position: "relative",
          zIndex: 1,
          color: "rgba(255,255,255,0.65)",
          animation: "qs-spin 1s linear infinite",
        }}
      />
      <style>{`@keyframes qs-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInviteContent />
    </Suspense>
  );
}
