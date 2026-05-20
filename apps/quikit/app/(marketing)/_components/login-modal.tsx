"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";

/**
 * QuikIT login modal — opened by any element carrying `data-quikit-login`
 * in the (statically-injected) marketing navbar.
 *
 * Auth topology:
 *  - Native email/password + Google + Microsoft go through the LAUNCHER's
 *    NextAuth, hit SAME-ORIGIN relative `/api/auth/*`. Completes only once
 *    the marketing site is served from the launcher origin (after the
 *    domain flip). On the standalone preview these fail by design.
 *  - Forgot-password OTP (F2) calls the dedicated auth service
 *    cross-origin (CORS-allowed, no session cookie set there).
 */

const DEFAULT_POST_LOGIN = "/apps";
/**
 * Forgot-password / verify-otp / reset-password are now SAME-ORIGIN to the
 * launcher (this app). The launcher hosts a thin `/api/auth/forgot-password`
 * route that mirrors the auth-service implementation but reuses the same
 * onboarding-invite email helpers the Native Email invite path already uses
 * (see `lib/email.ts → sendOnboardingInvitationEmail`). An empty string
 * means "relative to the current origin" — works identically on localhost
 * and prod, no env-var required.
 */
const AUTH_ORIGIN = "";

/**
 * Post-login destination. When the launcher bounces an unauthenticated
 * user here (incl. cross-app handoff) it appends `?next=<path>` — e.g.
 * `/apps?handoff=quikscale&to=/dashboard`. We honour it, but only if it's
 * a safe same-origin absolute path (open-redirect guard). Otherwise /apps.
 */
function resolvePostLogin(): string {
  if (typeof window === "undefined") return DEFAULT_POST_LOGIN;
  const raw = new URLSearchParams(window.location.search).get("next");
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return DEFAULT_POST_LOGIN;
}

type View =
  | "signin"
  | "forgotEmail"
  | "forgotOtp"
  | "forgotReset"
  // Native-invite "Set your password" step (FRD FR-SA-006/008). Auto-
  // entered when the modal opens on `/invitations/accept?token=…`. Twin
  // of SignInComponent's "invitation" step, restyled to match this
  // marketing modal's light paper theme instead of the dark split-screen.
  | "invitation";

async function getCsrfToken(): Promise<string> {
  const r = await fetch("/api/auth/csrf", { credentials: "include" });
  const j = (await r.json()) as { csrfToken?: string };
  if (!j.csrfToken) throw new Error("Could not start sign-in. Please retry.");
  return j.csrfToken;
}

/** NextAuth credentials handshake → true on success. */
async function credentialsSignIn(
  email: string,
  password: string,
  callbackUrl: string,
): Promise<boolean> {
  const csrfToken = await getCsrfToken();
  const body = new URLSearchParams({
    csrfToken,
    email: email.trim(),
    password,
    callbackUrl,
    json: "true",
  });
  const res = await fetch("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    credentials: "include",
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string };
  return res.ok && !!data.url && !/[?&]error=/.test(data.url);
}

export function LoginModal() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Invitation flow state. `inviteToken` is the single-use token from
  // `/invitations/accept?token=…`; `inviteEmail` is what
  // GET /api/invitations/accept returns once the token validates and is
  // shown as a read-only chip on the form. `inviteCurrent` is the user's
  // existing (default or previously-set) password, required by the API
  // for the Save & Continue branch.
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [inviteCurrent, setInviteCurrent] = useState("");
  const [inviteNew, setInviteNew] = useState("");
  const [inviteConfirm, setInviteConfirm] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setView("signin");
    setBusy(false);
    setError(null);
    setNotice(null);
    setPassword("");
    setOtp("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setInviteToken(null);
    setInviteEmail(null);
    setInviteCurrent("");
    setInviteNew("");
    setInviteConfirm("");
    setInviteLoading(false);
    setInviteSubmitting(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(reset, 250);
  }, [reset]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "[data-quikit-login]",
      );
      if (!el) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Auto-open when the launcher redirected an unauthenticated / cross-app
  // handoff user here (it appends ?next=… or ?login=1).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("next") || q.get("login") === "1") setOpen(true);
  }, []);

  // Invitation auto-open: when the modal mounts on /invitations/accept
  // with a ?token=… query, open immediately on the "invitation" view
  // (image 3) and prefetch invitation metadata so the email chip + form
  // can render with the user's data. We don't fall back to the email
  // step on token failure — instead the view renders an explanatory
  // error so the user knows the link is invalid/expired (same UX the
  // dark SignInComponent already shows on the auth host).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/invitations/accept") return;
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) return;
    setInviteToken(t);
    setView("invitation");
    setOpen(true);
    setInviteLoading(true);
    fetch(`/api/invitations/accept?token=${encodeURIComponent(t)}`, {
      credentials: "include",
    })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { email?: string };
          error?: string;
        };
        if (!r.ok || !j.success) {
          setError(j.error ?? "Invalid or expired invitation.");
          setInviteLoading(false);
          return;
        }
        setInviteEmail(j.data?.email ?? null);
        setInviteLoading(false);
      })
      .catch(() => {
        setError(
          "Couldn't reach the invitation service. Refresh to retry.",
        );
        setInviteLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 80);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, [open, view, close]);

  function goToApps() {
    window.location.assign(resolvePostLogin());
  }

  /* ── Native credentials (same-origin launcher NextAuth) ── */
  async function signInNative(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const ok = await credentialsSignIn(email, password, resolvePostLogin());
      if (!ok) {
        setError("Invalid email or password.");
        setBusy(false);
        return;
      }
      goToApps(); // → /apps (or ?next= handoff target) on success
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  /* ── OAuth (same-origin launcher NextAuth) ── */
  async function signInOAuth(provider: "google" | "azure-ad") {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const csrfToken = await getCsrfToken();
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `/api/auth/signin/${provider}`;
      form.style.display = "none";
      const add = (name: string, value: string) => {
        const i = document.createElement("input");
        i.type = "hidden";
        i.name = name;
        i.value = value;
        form.appendChild(i);
      };
      add("csrfToken", csrfToken);
      add("callbackUrl", resolvePostLogin());
      document.body.appendChild(form);
      form.submit();
    } catch {
      setError("Could not start single sign-on. Please try again.");
      setBusy(false);
    }
  }

  /* ── Invitation: Save & Continue (same-origin to launcher API) ── */
  async function submitInvitation(e?: React.FormEvent) {
    e?.preventDefault();
    if (inviteSubmitting) return;
    setError(null);
    if (!inviteToken) {
      setError("Missing invitation token. Please use the link from your email.");
      return;
    }
    if (!inviteCurrent || !inviteNew || !inviteConfirm) {
      setError("All password fields are required.");
      return;
    }
    if (inviteNew.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(inviteNew)) {
      setError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(inviteNew)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(inviteNew)) {
      setError("Password must contain at least one special character.");
      return;
    }
    if (inviteNew !== inviteConfirm) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }
    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: inviteToken,
          currentPassword: inviteCurrent,
          newPassword: inviteNew,
          confirmPassword: inviteConfirm,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { email?: string };
        error?: string;
      };
      if (!res.ok || !j.success) {
        setError(j.error ?? "Could not set your password. Please try again.");
        setInviteSubmitting(false);
        return;
      }
      // Auto sign-in with the new credentials so the user lands on /apps
      // without re-typing them — mirrors SignInComponent's behaviour.
      const signedIn = await credentialsSignIn(
        j.data?.email ?? inviteEmail ?? "",
        inviteNew,
        DEFAULT_POST_LOGIN,
      );
      if (!signedIn) {
        setNotice(
          "Password set. Please sign in with your new password.",
        );
        setEmail(j.data?.email ?? inviteEmail ?? "");
        setView("signin");
        setInviteSubmitting(false);
        return;
      }
      goToApps();
    } catch {
      setError("Network error. Please try again.");
      setInviteSubmitting(false);
    }
  }

  async function skipInvitation() {
    if (inviteSubmitting) return;
    setError(null);
    if (!inviteToken) {
      setError("Missing invitation token. Please use the link from your email.");
      return;
    }
    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken, skip: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { email?: string };
        error?: string;
      };
      if (!res.ok || !j.success) {
        setError(j.error ?? "Could not skip. Please try again.");
        setInviteSubmitting(false);
        return;
      }
      // Skip path: route the user to the email step with their address
      // pre-filled so they can sign in manually with the default password
      // (FR-SA-010). Same fallback the dark SignInComponent uses.
      setNotice("Invitation accepted. Sign in with your default password.");
      setEmail(j.data?.email ?? inviteEmail ?? "");
      setView("signin");
      setInviteSubmitting(false);
    } catch {
      setError("Network error. Please try again.");
      setInviteSubmitting(false);
    }
  }

  /* ── Forgot-password (F2: cross-origin to apps/auth) ── */
  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim()) {
      setError("Enter your account email.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${AUTH_ORIGIN}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.status === 429) {
        setError("Too many attempts. Please wait a few minutes.");
        setBusy(false);
        return;
      }
      // The reset flow no longer mails a 6-digit code — instead the server
      // resets the account to the system default password and emails a
      // single-use Set-Password link (same UX as the first-time native
      // invite). Stay on this view and show a confirmation notice so the
      // user knows to check their inbox.
      setNotice(
        "If an account exists for that email, we've emailed a temporary password and a link to set a new one. The link is valid for 7 days.",
      );
      setBusy(false);
    } catch {
      setError("Couldn't reach the reset service. Please try again.");
      setBusy(false);
    }
  }

  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${AUTH_ORIGIN}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        resetToken?: string;
      };
      if (!res.ok || !data.success || !data.resetToken) {
        setError("Invalid or expired code.");
        setBusy(false);
        return;
      }
      setResetToken(data.resetToken);
      setNotice(null);
      setView("forgotReset");
      setBusy(false);
    } catch {
      setError("Couldn't verify the code. Please try again.");
      setBusy(false);
    }
  }

  async function submitNewPassword(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${AUTH_ORIGIN}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, password: newPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setError(data.error || "Reset link expired. Request a new code.");
        setBusy(false);
        return;
      }
      const ok = await credentialsSignIn(email, newPassword, resolvePostLogin());
      if (!ok) {
        setNotice("Password updated. Please sign in with your new password.");
        setPassword("");
        setView("signin");
        setBusy(false);
        return;
      }
      goToApps(); // → /apps on success
    } catch {
      setError("Couldn't update your password. Please try again.");
      setBusy(false);
    }
  }

  /* ── Motion ── */
  const ease = [0.16, 1, 0.3, 1] as const; // ease-out-expo, no bounce
  const overlayV: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: reduce ? 0 : 0.24 } },
    exit: { opacity: 0, transition: { duration: reduce ? 0 : 0.18 } },
  };
  const cardV: Variants = reduce
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0 } },
        exit: { opacity: 0, transition: { duration: 0 } },
      }
    : {
        hidden: { opacity: 0, y: 18, scale: 0.985 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { duration: 0.42, ease },
        },
        exit: {
          opacity: 0,
          y: 10,
          scale: 0.99,
          transition: { duration: 0.2, ease },
        },
      };
  const stepV: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        hidden: { opacity: 0, x: 14 },
        show: { opacity: 1, x: 0, transition: { duration: 0.28, ease } },
        exit: { opacity: 0, x: -14, transition: { duration: 0.16, ease } },
      };
  const tap = reduce ? undefined : { scale: 0.985 };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="quikit-login-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in to QuikIT"
          variants={overlayV}
          initial="hidden"
          animate="show"
          exit="exit"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          style={S.overlay}
        >
          <motion.div
            variants={cardV}
            initial="hidden"
            animate="show"
            exit="exit"
            style={S.card}
          >
            <span style={S.accentBar} aria-hidden />
            <button aria-label="Close" onClick={close} style={S.x}>
              ×
            </button>

            <div style={S.brandRow}>
              <span style={S.logoMark} aria-hidden />
              <span style={S.brand}>QuikIT</span>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                variants={stepV}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                {view === "signin" && (
                  <>
                    <h2 style={S.title}>Welcome back</h2>
                    <p style={S.sub}>One login. Every tool.</p>

                    <motion.button
                      type="button"
                      disabled={busy}
                      whileTap={tap}
                      onClick={() => signInOAuth("google")}
                      style={S.oauthBtn}
                    >
                      <span style={S.gIcon}>G</span> Continue with Google
                    </motion.button>
                    <motion.button
                      type="button"
                      disabled={busy}
                      whileTap={tap}
                      onClick={() => signInOAuth("azure-ad")}
                      style={S.oauthBtn}
                    >
                      <span style={S.msIcon}>⊞</span> Continue with Microsoft
                    </motion.button>

                    <div style={S.divider}>
                      <span style={S.dividerLine} />
                      <span style={S.dividerText}>or</span>
                      <span style={S.dividerLine} />
                    </div>

                    <form onSubmit={signInNative}>
                      <label style={S.label}>Email</label>
                      <input
                        ref={firstFieldRef}
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        style={S.input}
                      />
                      <label style={S.label}>Password</label>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        style={S.input}
                      />
                      <motion.button
                        type="submit"
                        disabled={busy}
                        whileTap={tap}
                        style={S.primary}
                      >
                        {busy ? "Signing in…" : "Log in"}
                      </motion.button>
                    </form>

                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setNotice(null);
                        setView("forgotEmail");
                      }}
                      style={S.linkBtn}
                    >
                      Forgot password?
                    </button>
                  </>
                )}

                {view === "forgotEmail" && (
                  <>
                    <h2 style={S.title}>Reset password</h2>
                    <p style={S.sub}>
                      We&apos;ll email you a 6-digit code to reset it.
                    </p>
                    <form onSubmit={requestOtp}>
                      <label style={S.label}>Account email</label>
                      <input
                        ref={firstFieldRef}
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        style={S.input}
                      />
                      <motion.button
                        type="submit"
                        disabled={busy}
                        whileTap={tap}
                        style={S.primary}
                      >
                        {busy ? "Sending…" : "Send code"}
                      </motion.button>
                    </form>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setView("signin");
                      }}
                      style={S.linkBtn}
                    >
                      ← Back to sign in
                    </button>
                  </>
                )}

                {view === "forgotOtp" && (
                  <>
                    <h2 style={S.title}>Enter code</h2>
                    <p style={S.sub}>
                      Sent to <strong style={S.strong}>{email}</strong>.
                      Expires in 3 minutes.
                    </p>
                    <form onSubmit={verifyOtp}>
                      <label style={S.label}>6-digit code</label>
                      <input
                        ref={firstFieldRef}
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) =>
                          setOtp(
                            e.target.value.replace(/\D/g, "").slice(0, 6),
                          )
                        }
                        placeholder="123456"
                        style={{
                          ...S.input,
                          letterSpacing: "0.45em",
                          textAlign: "center",
                          fontSize: 18,
                          fontWeight: 600,
                        }}
                      />
                      <motion.button
                        type="submit"
                        disabled={busy}
                        whileTap={tap}
                        style={S.primary}
                      >
                        {busy ? "Verifying…" : "Verify"}
                      </motion.button>
                    </form>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setOtp("");
                        setView("forgotEmail");
                      }}
                      style={S.linkBtn}
                    >
                      ← Use a different email
                    </button>
                  </>
                )}

                {view === "invitation" && (
                  <>
                    <h2 style={S.title}>Set your password</h2>
                    <p style={S.sub}>
                      You&apos;re using a temporary password. Set a new one
                      now, or skip and keep the default for now.
                    </p>
                    {inviteEmail && (
                      <div style={S.emailChip}>
                        <span style={S.emailDot} />
                        <span>{inviteEmail}</span>
                      </div>
                    )}
                    {inviteLoading ? (
                      <p style={{ ...S.sub, marginTop: 18 }}>
                        Validating your invitation…
                      </p>
                    ) : (
                      <form onSubmit={submitInvitation}>
                        <label style={S.label}>Enter your default password</label>
                        <input
                          ref={firstFieldRef}
                          type="password"
                          autoComplete="current-password"
                          value={inviteCurrent}
                          onChange={(e) => setInviteCurrent(e.target.value)}
                          placeholder="••••••••"
                          style={S.input}
                        />
                        <label style={S.label}>New password</label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={inviteNew}
                          onChange={(e) => setInviteNew(e.target.value)}
                          placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special"
                          style={S.input}
                        />
                        <label style={S.label}>Re-enter password</label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={inviteConfirm}
                          onChange={(e) => setInviteConfirm(e.target.value)}
                          placeholder="••••••••"
                          style={S.input}
                        />
                        <motion.button
                          type="submit"
                          disabled={inviteSubmitting}
                          whileTap={tap}
                          style={S.primary}
                        >
                          {inviteSubmitting ? "Saving…" : "Save & Continue"}
                        </motion.button>
                        <motion.button
                          type="button"
                          disabled={inviteSubmitting}
                          whileTap={tap}
                          onClick={skipInvitation}
                          style={{ ...S.oauthBtn, marginTop: 12 }}
                        >
                          Skip for now
                        </motion.button>
                      </form>
                    )}
                  </>
                )}

                {view === "forgotReset" && (
                  <>
                    <h2 style={S.title}>New password</h2>
                    <p style={S.sub}>Choose a strong password (8+ characters).</p>
                    <form onSubmit={submitNewPassword}>
                      <label style={S.label}>New password</label>
                      <input
                        ref={firstFieldRef}
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        style={S.input}
                      />
                      <label style={S.label}>Confirm password</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        style={S.input}
                      />
                      <motion.button
                        type="submit"
                        disabled={busy}
                        whileTap={tap}
                        style={S.primary}
                      >
                        {busy ? "Updating…" : "Update & sign in"}
                      </motion.button>
                    </form>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.p
                  key="err"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.18 }}
                  style={S.error}
                >
                  {error}
                </motion.p>
              )}
              {notice && !error && (
                <motion.p
                  key="notice"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.18 }}
                  style={S.notice}
                >
                  {notice}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── On-brand tokens (OKLCH, tinted; mirrors the marketing palette:
   warm paper, near-black ink, signature sand/gold accent). Not reliant
   on the per-page CSS vars, which aren't in scope at layout level. ── */
const INK = "oklch(0.18 0.012 265)";
const PAPER = "oklch(0.99 0.003 95)";
const ACCENT = "oklch(0.79 0.055 78)";
const ACCENT_STRONG = "oklch(0.72 0.066 72)";
const MUTED = "oklch(0.55 0.018 260)";
const HAIRLINE = "oklch(0.18 0.012 265 / 0.12)";
const FIELD_BORDER = "oklch(0.18 0.012 265 / 0.16)";

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2147483000,
    background: "oklch(0.18 0.012 265 / 0.55)",
    backdropFilter: "blur(3px)",
    WebkitBackdropFilter: "blur(3px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    fontFamily: "Inter, system-ui, sans-serif",
  },
  card: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    maxWidth: 404,
    background: PAPER,
    borderRadius: 24,
    padding: "40px 34px 30px",
    border: `1px solid ${HAIRLINE}`,
    boxShadow:
      "0 1px 3px oklch(0.18 0.012 265 / 0.05), 0 40px 100px oklch(0.18 0.012 265 / 0.22)",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: ACCENT,
  },
  x: {
    position: "absolute",
    top: 16,
    right: 18,
    border: "none",
    background: "transparent",
    fontSize: 24,
    lineHeight: 1,
    color: MUTED,
    cursor: "pointer",
    padding: 4,
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    marginBottom: 22,
  },
  logoMark: {
    width: 20,
    height: 20,
    borderRadius: 6,
    background: ACCENT,
    boxShadow: `0 0 0 4px oklch(0.93 0.03 82)`,
    display: "inline-block",
  },
  brand: {
    fontWeight: 800,
    fontSize: 15,
    color: INK,
    letterSpacing: "-0.01em",
  },
  title: {
    fontFamily: "'DM Serif Display', Georgia, serif",
    fontSize: 27,
    fontWeight: 400,
    color: INK,
    margin: "0 0 5px",
    letterSpacing: "-0.01em",
  },
  sub: { fontSize: 13.5, color: MUTED, margin: "0 0 22px" },
  strong: { color: INK, fontWeight: 600 },
  oauthBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "11px 14px",
    marginBottom: 10,
    border: `1px solid ${FIELD_BORDER}`,
    borderRadius: 12,
    background: PAPER,
    color: INK,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  gIcon: { fontWeight: 800, color: "#4285F4", fontFamily: "Arial, sans-serif" },
  msIcon: { color: "#00A4EF", fontSize: 16 },
  divider: { display: "flex", alignItems: "center", gap: 12, margin: "20px 0" },
  dividerLine: { flex: 1, height: 1, background: HAIRLINE },
  dividerText: {
    fontSize: 11,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: INK,
    margin: "13px 0 6px",
  },
  input: {
    width: "100%",
    padding: "11px 13px",
    border: `1px solid ${FIELD_BORDER}`,
    borderRadius: 11,
    fontSize: 14,
    outline: "none",
    color: INK,
    background: PAPER,
    fontFamily: "inherit",
  },
  primary: {
    width: "100%",
    marginTop: 20,
    padding: "12px 16px",
    border: "none",
    borderRadius: 12,
    background: INK,
    color: PAPER,
    fontSize: 14.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: `0 8px 24px oklch(0.18 0.012 265 / 0.18)`,
  },
  linkBtn: {
    display: "block",
    width: "100%",
    marginTop: 16,
    border: "none",
    background: "transparent",
    color: ACCENT_STRONG,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
    fontFamily: "inherit",
  },
  error: {
    marginTop: 16,
    padding: "10px 12px",
    background: "oklch(0.96 0.025 25)",
    border: "1px solid oklch(0.84 0.09 25)",
    borderRadius: 10,
    color: "oklch(0.5 0.16 25)",
    fontSize: 13,
  },
  notice: {
    marginTop: 16,
    padding: "10px 12px",
    background: "oklch(0.93 0.03 82)",
    border: `1px solid ${ACCENT}`,
    borderRadius: 10,
    color: "oklch(0.42 0.05 70)",
    fontSize: 13,
  },
  // Read-only email "chip" shown above the Set-Password form. Matches
  // the bullet + email line in image 3.
  emailChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "6px 0 18px",
    fontSize: 13,
    color: INK,
    fontWeight: 500,
  },
  emailDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: ACCENT_STRONG,
    display: "inline-block",
  },
};
