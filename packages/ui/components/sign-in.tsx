"use client";

import React, {
  useState, useRef, useEffect, forwardRef,
  useImperativeHandle, useMemo, useCallback,
} from "react";
import { Eye, EyeOff, ArrowLeft, X, AlertCircle, PartyPopper, Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn as nextAuthSignIn } from "next-auth/react";
import type { GlobalOptions as ConfettiGlobalOptions, CreateTypes as ConfettiInstance, Options as ConfettiOptions } from "canvas-confetti";
import confetti from "canvas-confetti";

/* ─── Confetti ─── */
type Api = { fire: (options?: ConfettiOptions) => void };
export type ConfettiRef = Api | null;

const Confetti = forwardRef<
  ConfettiRef,
  React.ComponentPropsWithRef<"canvas"> & {
    options?: ConfettiOptions;
    globalOptions?: ConfettiGlobalOptions;
    manualstart?: boolean;
  }
>((props, ref) => {
  const { options, globalOptions = { resize: true, useWorker: true }, manualstart = false, ...rest } = props;
  const instanceRef = useRef<ConfettiInstance | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement) => {
    if (node !== null) {
      if (instanceRef.current) return;
      instanceRef.current = confetti.create(node, { ...globalOptions, resize: true });
    } else {
      instanceRef.current?.reset();
      instanceRef.current = null;
    }
  }, [globalOptions]);
  const fire = useCallback((opts = {}) => instanceRef.current?.({ ...options, ...opts }), [options]);
  const api = useMemo(() => ({ fire }), [fire]);
  useImperativeHandle(ref, () => api, [api]);
  useEffect(() => { if (!manualstart) fire(); }, [manualstart, fire]);
  return <canvas ref={canvasRef} {...rest} />;
});
Confetti.displayName = "Confetti";

/* ─── Icons ─── */
const GoogleIcon = () => (
  <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="18" height="18">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.79 2.71v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.95 10.7a5.41 5.41 0 0 1 0-3.4V4.97H.96a9 9 0 0 0 0 8.06l3-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="18" height="18">
    <rect x="2" y="2" width="9" height="9" fill="#F25022"/>
    <rect x="13" y="2" width="9" height="9" fill="#7FBA00"/>
    <rect x="2" y="13" width="9" height="9" fill="#00A4EF"/>
    <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
  </svg>
);

/* ─── Main Component ─── */
type AuthStep = "email" | "password" | "login" | "profile" | "forgot-email" | "forgot-sent" | "forgot-otp" | "new-password" | "invitation";

interface SignInComponentProps {
  logo?: React.ReactNode;
  brandName?: string;
  redirectPath?: string;
  callbackUrl?: string | null;
  initialError?: string | null;
  hardNavigate?: boolean;
  initialStep?: AuthStep;
  invitationToken?: string | null;
  invitationLauncherUrl?: string;
}

export const SignInComponent = ({
  logo: _logo,
  brandName = "QuikIT",
  redirectPath = "/apps",
  callbackUrl,
  initialError,
  hardNavigate = true,
  initialStep,
  invitationToken,
  invitationLauncherUrl,
}: SignInComponentProps) => {
  const router = useRouter();

  // Normalize legacy "email" / "password" / "login" → unified "login" step.
  const normalizeStep = (s: AuthStep | undefined): AuthStep => {
    if (s === "email" || s === "password" || s === "login") return "login";
    return s ?? "login";
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>(normalizeStep(initialStep));
  const [modalStatus, setModalStatus] = useState<"closed" | "loading" | "error" | "success">("closed");
  const [modalErrorMessage, setModalErrorMessage] = useState("");
  const [banner, setBanner] = useState<string | null>(initialError ?? null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  // Forgot-password flow state
  // The backend `/api/auth/forgot-password` + `/api/auth/verify-otp` pair
  // still issues a 6-digit code. We keep the OTP plumbing in the state +
  // handlers (so the email + countdown + resend continue to work) but the
  // UI surface combines temp-password entry + new-password + confirm onto
  // a single screen. `tempPassword` is the user-typed value passed to
  // `verify-otp` as the `otp` param.
  const [tempPassword, setTempPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // Invitation state
  const [invitationLoading, setInvitationLoading] = useState<boolean>(initialStep === "invitation");
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationData, setInvitationData] = useState<{
    orgName: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null>(null);
  const [inviteCurrentPassword, setInviteCurrentPassword] = useState("");
  const [inviteNewPassword, setInviteNewPassword] = useState("");
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState("");
  const [inviteShowPassword, setInviteShowPassword] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteFormError, setInviteFormError] = useState<string | null>(null);

  const confettiRef = useRef<ConfettiRef>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);

  const isEmailValid = /\S+@\S+\.\S+/.test(email);
  const isPasswordValid = password.length > 0;
  const isProfileValid = firstName.trim().length > 0 && lastName.trim().length > 0;
  const otpValue = otpDigits.join("");
  const isOtpComplete = otpValue.length === 6 && /^\d{6}$/.test(otpValue);
  const isNewPasswordValid =
    newPassword.length >= 8 && newPassword === confirmPassword;

  const fireConfetti = () => {
    const fire = confettiRef.current?.fire;
    if (!fire) return;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
    fire({ ...defaults, particleCount: 60, origin: { x: 0.1, y: 0.9 }, angle: 60 });
    fire({ ...defaults, particleCount: 60, origin: { x: 0.9, y: 0.9 }, angle: 120 });
  };

  const navigateToTarget = () => {
    const target = callbackUrl || redirectPath;
    if (hardNavigate) {
      window.location.assign(target);
    } else {
      router.push(target);
    }
  };

  const advancePostSignIn = async () => {
    try {
      const res = await fetch("/api/auth/me/profile", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.complete === false) {
          setModalStatus("closed");
          setAuthStep("profile");
          return;
        }
      }
    } catch {
      // Network blip — fall through to redirect.
    }
    fireConfetti();
    setModalStatus("success");
    setTimeout(navigateToTarget, 1400);
  };

  const runSignIn = async (signInEmailArg?: string, signInPasswordArg?: string) => {
    setModalStatus("loading");
    const signInEmail = signInEmailArg || "ceo@demo.com";
    const signInPassword = signInPasswordArg || "password123";
    try {
      const result = await nextAuthSignIn("credentials", {
        email: signInEmail,
        password: signInPassword,
        redirect: false,
      });
      if (result?.ok) {
        await advancePostSignIn();
      } else {
        setModalErrorMessage(result?.error === "Invalid credentials" ? "Invalid email or password." : "Sign in failed. Please try again.");
        setModalStatus("error");
      }
    } catch {
      setModalErrorMessage("Something went wrong. Please try again.");
      setModalStatus("error");
    }
  };

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProfileValid || savingProfile) return;
    setProfileError(null);
    setSavingProfile(true);
    try {
      const res = await fetch("/api/auth/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not save your name.");
      }
      fireConfetti();
      setModalStatus("success");
      setTimeout(navigateToTarget, 1100);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not save your name.");
      setSavingProfile(false);
    }
  };

  /* ─── Forgot-password (OTP) flow ───────────────────────────────────── */

  const sendOtp = async (): Promise<boolean> => {
    if (!isEmailValid) return false;
    setOtpSending(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOtpError(data?.error || "Could not send code. Try again shortly.");
        return false;
      }
      // Client-side resend cooldown — 5 minutes. The backend already
      // rate-limits per IP + per email, but this stops the user from
      // mashing "Resend temporary password" before the previous one
      // could realistically arrive. Server-side expiry of the temp
      // password itself is NOT surfaced — only the resend lockout is.
      const RESEND_COOLDOWN_SECONDS = 5 * 60;
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpExpiresAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setOtpSecondsLeft(RESEND_COOLDOWN_SECONDS);
      return true;
    } catch {
      setOtpError("Network error. Try again.");
      return false;
    } finally {
      setOtpSending(false);
    }
  };

  const startForgotPassword = async () => {
    // The backend `/api/auth/forgot-password` resets the user's password
    // to DEFAULT_RESET_PASSWORD (the temporary password emailed to them)
    // and flips `mustChangePassword = true`. We don't need to verify the
    // temp password against an OTP store — it's just their current
    // password now. So the UI flow becomes:
    //
    //   1. forgot-email — user types email, we hit forgot-password endpoint
    //   2. forgot-otp   — 3-field form: temp password + new + confirm
    //                     → calls signIn(credentials) with the temp password
    //                     → calls /api/auth/me/set-password to commit the new one
    //
    // No OTP store involved — the verify-otp endpoint isn't used by this flow.
    const ok = await sendOtp();
    if (ok) setAuthStep("forgot-otp");
  };

  const verifyOtpDigits = async () => {
    if (!isOtpComplete || otpVerifying) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp: otpValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setOtpError(data?.error || "Invalid or expired code.");
        setOtpDigits(["", "", "", "", "", ""]);
        setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
        return;
      }
      setResetToken(data.resetToken);
      setAuthStep("new-password");
    } catch {
      setOtpError("Network error. Try again.");
    } finally {
      setOtpVerifying(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNewPasswordValid || resetSubmitting || !resetToken) return;
    setResetError(null);
    setResetSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetToken, password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Could not update password.");
      }
      const signInResult = await nextAuthSignIn("credentials", {
        email,
        password: newPassword,
        redirect: false,
      });
      if (!signInResult?.ok) {
        setBanner("Password updated. Please sign in with your new password.");
        setAuthStep("login");
        setPassword("");
        setResetSubmitting(false);
        return;
      }
      fireConfetti();
      setModalStatus("success");
      setTimeout(navigateToTarget, 1200);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not update password.");
      setResetSubmitting(false);
    }
  };

  /**
   * Temporary-password reset flow.
   *
   * After `/api/auth/forgot-password` runs the user's password IS the
   * `DEFAULT_RESET_PASSWORD` (emailed to them as the "temporary
   * password"). We:
   *   1. Validate the 3 fields client-side (incl. password policy: 8+ chars,
   *      one uppercase, one number, one special).
   *   2. NextAuth credentials sign-in with the temp password — authenticates
   *      and plants the session cookie on the auth host.
   *   3. POST `/api/auth/me/set-password` with `{currentPassword: tempPw,
   *      newPassword, confirmPassword}`. The endpoint already validates
   *      bcrypt(currentPassword) + policy + sets new + clears
   *      mustChangePassword.
   *   4. Re-sign-in with the new credentials so the post-login navigation
   *      uses a fresh session.
   *
   * No OTP store, no reset token, no separate verify endpoint — the
   * existing forgot-password + set-password endpoints are everything we
   * need.
   */
  const submitResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    // Client-side validation — match the server's password policy so the
    // UI errors don't drift from the actual rejection reason.
    if (tempPassword.trim().length === 0) {
      setResetError("Enter the temporary password from your email.");
      return;
    }
    if (newPassword.length < 8) {
      setResetError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setResetError("New password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setResetError("New password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setResetError("New password must contain at least one special character.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords don't match.");
      return;
    }
    if (resetSubmitting) return;

    setResetSubmitting(true);
    try {
      // 1. Sign in with the temp password — plants the session cookie on
      //    the auth host so the `/api/auth/me/set-password` call below
      //    passes the JWT guard.
      const tempSignIn = await nextAuthSignIn("credentials", {
        email,
        password: tempPassword.trim(),
        redirect: false,
      });
      if (!tempSignIn?.ok) {
        setResetError(
          "Temporary password is incorrect. Check the email we sent or request a new one.",
        );
        setResetSubmitting(false);
        return;
      }

      // 2. Set the new password.
      const setPwRes = await fetch("/api/auth/me/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: tempPassword.trim(),
          newPassword,
          confirmPassword,
        }),
      });
      const setPwData = await setPwRes.json().catch(() => ({}));
      if (!setPwRes.ok || !setPwData?.success) {
        throw new Error(setPwData?.error || "Could not update password.");
      }

      // 3. Re-sign-in with the NEW password so the navigated-to-target
      //    request carries a session bound to the new credentials. (The
      //    earlier sign-in is also valid, but re-signing avoids any
      //    `mustChangePassword`-related re-prompts downstream.)
      const finalSignIn = await nextAuthSignIn("credentials", {
        email,
        password: newPassword,
        redirect: false,
      });
      if (!finalSignIn?.ok) {
        setBanner("Password updated. Please sign in with your new password.");
        setAuthStep("login");
        setPassword("");
        setTempPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setResetSubmitting(false);
        return;
      }

      fireConfetti();
      setModalStatus("success");
      setTimeout(navigateToTarget, 1200);
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : "Could not update password.",
      );
      setResetSubmitting(false);
    }
  };

  /* ─── Native-invite acceptance flow ─────── */

  useEffect(() => {
    if (initialStep !== "invitation") return;
    if (!invitationToken) {
      setInvitationError("No invitation token provided.");
      setInvitationLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/invitations/accept?token=${encodeURIComponent(invitationToken)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success) {
          setInvitationData(j.data);
          if (j.data?.email) setEmail(j.data.email);
        } else {
          setInvitationError(j?.error || "Invalid invitation");
        }
      })
      .catch(() => {
        if (!cancelled) setInvitationError("Network error. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setInvitationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialStep, invitationToken]);

  const submitInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteSubmitting) return;
    setInviteFormError(null);

    if (!inviteCurrentPassword) {
      setInviteFormError("Please enter your current password.");
      return;
    }
    if (inviteNewPassword.length < 8) {
      setInviteFormError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(inviteNewPassword)) {
      setInviteFormError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(inviteNewPassword)) {
      setInviteFormError("Password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(inviteNewPassword)) {
      setInviteFormError("Password must contain at least one special character.");
      return;
    }
    if (inviteNewPassword !== inviteConfirmPassword) {
      setInviteFormError("Passwords do not match. Please re-enter.");
      return;
    }

    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: invitationToken,
          currentPassword: inviteCurrentPassword,
          newPassword: inviteNewPassword,
          confirmPassword: inviteConfirmPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setInviteFormError(json?.error ?? "Could not set your password. Please try again.");
        setInviteSubmitting(false);
        return;
      }

      setModalStatus("loading");
      const signInResult = await nextAuthSignIn("credentials", {
        email: json.data?.email ?? invitationData?.email ?? "",
        password: inviteNewPassword,
        redirect: false,
      });
      if (!signInResult?.ok) {
        setModalStatus("closed");
        setBanner("Password set. Please sign in with your new password.");
        setAuthStep("login");
        setEmail(json.data?.email ?? invitationData?.email ?? "");
        setInviteSubmitting(false);
        return;
      }
      fireConfetti();
      setModalStatus("success");
      const target = invitationLauncherUrl || callbackUrl || redirectPath;
      setTimeout(() => {
        if (hardNavigate) window.location.assign(target);
        else router.push(target);
      }, 1200);
    } catch {
      setInviteFormError("Network error. Please try again.");
      setInviteSubmitting(false);
    }
  };

  const skipInvitation = async () => {
    if (inviteSubmitting) return;
    setInviteFormError(null);
    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invitationToken, skip: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        setInviteFormError(json?.error ?? "Could not skip. Please try again.");
        setInviteSubmitting(false);
        return;
      }
      setBanner("Invitation accepted. Sign in to continue.");
      setEmail(json.data?.email ?? invitationData?.email ?? "");
      setAuthStep("login");
      setInviteSubmitting(false);
    } catch {
      setInviteFormError("Network error. Please try again.");
      setInviteSubmitting(false);
    }
  };

  const handleSocialSignIn = (provider: "google" | "microsoft") => {
    const id = provider === "microsoft" ? "azure-ad" : "google";
    setModalStatus("loading");
    nextAuthSignIn(id, { callbackUrl: "/login?step=profile" });
  };

  const handleNativeSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid) { setModalErrorMessage("Please enter a valid email address."); setModalStatus("error"); return; }
    if (!isPasswordValid) { setModalErrorMessage("Please enter your password."); setModalStatus("error"); return; }
    runSignIn(email, password);
  };

  useEffect(() => {
    if (authStep === "login") setTimeout(() => passwordInputRef.current?.focus(), 200);
    if (authStep === "profile") setTimeout(() => firstNameInputRef.current?.focus(), 200);
    if (authStep === "forgot-otp") setTimeout(() => otpInputRefs.current[0]?.focus(), 200);
    if (authStep === "new-password") setTimeout(() => newPasswordInputRef.current?.focus(), 200);
  }, [authStep]);

  useEffect(() => {
    if (authStep !== "profile") return;
    if (firstName !== "" || lastName !== "") return;
    let cancelled = false;
    fetch("/api/auth/me/profile", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        const f =
          (data.suggestedFirstName as string | null) ||
          (data.firstName as string) ||
          "";
        const l =
          (data.suggestedLastName as string | null) ||
          (data.lastName as string) ||
          "";
        if (f) setFirstName(f);
        if (l) setLastName(l);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStep]);

  useEffect(() => {
    if (authStep !== "forgot-otp" || !otpExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
      setOtpSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [authStep, otpExpiresAt]);

  useEffect(() => {
    if (authStep === "forgot-otp" && isOtpComplete && !otpVerifying && otpSecondsLeft > 0) {
      verifyOtpDigits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue, authStep]);

  /* ─── OTP digit input handlers ─────────────────────────────────────── */

  const handleOtpChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 0) {
      const next = [...otpDigits];
      next[index] = "";
      setOtpDigits(next);
      return;
    }
    if (digits.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        next[index + i] = digits[i]!;
      }
      setOtpDigits(next);
      const lastFilled = Math.min(index + digits.length - 1, 5);
      const nextFocus = lastFilled < 5 ? lastFilled + 1 : 5;
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }
    const next = [...otpDigits];
    next[index] = digits;
    setOtpDigits(next);
    if (index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      e.preventDefault();
      const next = [...otpDigits];
      next[index - 1] = "";
      setOtpDigits(next);
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i]!;
    setOtpDigits(next);
    const lastFilled = Math.min(text.length - 1, 5);
    const nextFocus = lastFilled < 5 ? lastFilled + 1 : 5;
    otpInputRefs.current[nextFocus]?.focus();
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const goBackToLogin = () => {
    setAuthStep("login");
    setPassword("");
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError(null);
    setOtpExpiresAt(null);
    setResetError(null);
    setNewPassword("");
    setConfirmPassword("");
  };

  /* ─── Step progress (forgot-password flow only) ─── */
  const fpStepIndex =
    authStep === "forgot-email" ? 1 :
    authStep === "forgot-sent" ? 2 :
    authStep === "forgot-otp" ? 2 :
    authStep === "new-password" ? 3 : 0;
  const isForgotFlow = fpStepIndex > 0;

  return (
    <div className="quikit-auth-wrap">
      <style dangerouslySetInnerHTML={{ __html: `
        .quikit-auth-wrap, .quikit-auth-wrap *, .quikit-auth-wrap *::before, .quikit-auth-wrap *::after { box-sizing:border-box; }
        .quikit-auth-wrap { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#fff; color:#111; -webkit-font-smoothing:antialiased; height:100vh; padding:24px; display:flex; overflow:hidden; }
        .quikit-auth-wrap a { text-decoration:none; color:inherit; }
        .quikit-auth-wrap img { display:block; max-width:100%; }
        @keyframes qkFadeInUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        .quikit-auth-wrap .fade-in-up { animation:qkFadeInUp 0.7s cubic-bezier(.22,1,.36,1) both; }
        .quikit-auth-wrap .fade-in-up.d1 { animation-delay:0.15s; }
        .quikit-auth-wrap .fade-in-up.d2 { animation-delay:0.30s; }
        .quikit-auth-wrap .fade-in-up.d3 { animation-delay:0.45s; }
        .quikit-auth-wrap .fade-in-up.d4 { animation-delay:0.60s; }
        .quikit-auth-wrap .auth-layout { flex:1; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,calc(40% - 12px)); gap:24px; height:100%; background:transparent; }
        .quikit-auth-wrap .auth-side { position:relative; background:url('/auth/login-bg.webp') center/cover no-repeat; color:#fff; padding:48px; display:flex; flex-direction:column; overflow:hidden; border-radius:24px; }
        .quikit-auth-wrap .auth-back { position:absolute; top:24px; left:24px; z-index:2; width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(255,255,255,0.18); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); color:#fff; border:1px solid rgba(255,255,255,0.22); transition:background .15s, transform .1s; cursor:pointer; }
        .quikit-auth-wrap .auth-back:hover { background:rgba(255,255,255,0.28); }
        .quikit-auth-wrap .auth-back:active { transform:scale(0.94); }
        .quikit-auth-wrap .auth-back svg { width:18px; height:18px; }
        .quikit-auth-wrap .auth-main { display:flex; flex-direction:column; padding:24px 48px; height:100%; background:#fff; overflow:auto; border-radius:24px; }
        .quikit-auth-wrap .auth-main-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-shrink:0; }
        .quikit-auth-wrap .auth-logo img { height:32px; width:auto; }
        .quikit-auth-wrap .auth-card { width:100%; max-width:420px; margin:auto; }
        .quikit-auth-wrap .auth-card h1 { font-size:24px; font-weight:800; letter-spacing:-0.02em; text-align:center; margin-bottom:8px; color:#0D1117; }
        .quikit-auth-wrap .auth-card .auth-sub { font-size:14px; color:#6B7280; text-align:center; margin-bottom:28px; line-height:1.6; }
        .quikit-auth-wrap .auth-oauth { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:12px 16px; margin-bottom:12px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-family:inherit; font-size:14px; font-weight:600; color:#0D1117; cursor:pointer; transition:background .15s, border-color .15s, transform .1s; }
        .quikit-auth-wrap .auth-oauth:hover { background:#F7F7F4; border-color:rgba(0,0,0,0.2); }
        .quikit-auth-wrap .auth-oauth:active { transform:scale(0.98); }
        .quikit-auth-wrap .auth-oauth svg { width:18px; height:18px; flex-shrink:0; }
        .quikit-auth-wrap .auth-divider { position:relative; text-align:center; margin:22px 0 18px; color:#9CA3AF; font-size:12px; }
        .quikit-auth-wrap .auth-divider::before { content:""; position:absolute; left:0; right:0; top:50%; height:1px; background:rgba(0,0,0,0.08); }
        .quikit-auth-wrap .auth-divider span { position:relative; background:#fff; padding:0 12px; }
        .quikit-auth-wrap .auth-field { margin-bottom:14px; }
        .quikit-auth-wrap .auth-field label { display:block; font-size:13px; font-weight:600; color:#0D1117; margin-bottom:6px; }
        .quikit-auth-wrap .auth-field input { width:100%; padding:12px 14px; font-family:inherit; font-size:14px; color:#0D1117; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; transition:border-color .15s, box-shadow .15s; outline:none; }
        .quikit-auth-wrap .auth-field input::placeholder { color:#9CA3AF; }
        .quikit-auth-wrap .auth-field input:focus { border-color:#CDB18B; box-shadow:0 0 0 3px rgba(205,177,139,0.18); }
        .quikit-auth-wrap .auth-password { position:relative; }
        .quikit-auth-wrap .auth-password input { padding-right:42px; }
        .quikit-auth-wrap .auth-eye { position:absolute; right:6px; top:50%; transform:translateY(-50%); width:34px; height:34px; background:transparent; border:none; cursor:pointer; color:#9CA3AF; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:color .15s, background .15s; }
        .quikit-auth-wrap .auth-eye:hover { color:#0D1117; background:rgba(0,0,0,0.04); }
        .quikit-auth-wrap .auth-eye svg { width:18px; height:18px; }
        .quikit-auth-wrap .auth-submit { width:100%; padding:14px 18px; margin-top:18px; background:#CDB18B; border:none; border-radius:10px; font-family:inherit; font-size:14px; font-weight:700; color:#0D1117; cursor:pointer; transition:background .15s, transform .1s; }
        .quikit-auth-wrap .auth-submit:hover:not(:disabled) { background:#bd9f76; }
        .quikit-auth-wrap .auth-submit:active:not(:disabled) { transform:scale(0.99); }
        .quikit-auth-wrap .auth-submit:disabled { opacity:.6; cursor:not-allowed; }
        .quikit-auth-wrap .auth-secondary { width:100%; padding:12px 18px; margin-top:10px; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; font-family:inherit; font-size:14px; font-weight:600; color:#0D1117; cursor:pointer; transition:background .15s; }
        .quikit-auth-wrap .auth-secondary:hover:not(:disabled) { background:#F7F7F4; }
        .quikit-auth-wrap .auth-secondary:disabled { opacity:.6; cursor:not-allowed; }
        .quikit-auth-wrap .auth-forgot { display:block; text-align:center; margin-top:18px; font-size:13px; font-weight:600; color:#0D1117; text-decoration:underline; text-underline-offset:3px; background:none; border:none; cursor:pointer; width:100%; font-family:inherit; }
        .quikit-auth-wrap .auth-forgot:hover { color:#CDB18B; }
        .quikit-auth-wrap .auth-foot { display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:24px; font-size:12px; color:#9CA3AF; border-top:1px solid rgba(0,0,0,0.05); flex-shrink:0; }
        .quikit-auth-wrap .auth-foot-links { display:flex; gap:24px; }
        .quikit-auth-wrap .auth-foot-links a { color:#6B7280; transition:color .15s; }
        .quikit-auth-wrap .auth-foot-links a:hover { color:#0D1117; }
        .quikit-auth-wrap .auth-signup-link { font-size:13px; color:#6B7280; }
        .quikit-auth-wrap .auth-signup-link a { color:#0D1117; font-weight:600; text-decoration:underline; text-underline-offset:3px; }
        .quikit-auth-wrap .auth-signup-link a:hover { color:#CDB18B; }
        .quikit-auth-wrap .auth-banner { display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border-radius:10px; background:#FEF2F2; border:1px solid #FECACA; color:#991B1B; font-size:13px; margin-bottom:16px; }
        .quikit-auth-wrap .auth-banner button { background:none; border:none; color:#991B1B; cursor:pointer; padding:0; display:flex; align-items:center; }
        .quikit-auth-wrap .auth-error { color:#B91C1C; font-size:12.5px; margin-top:8px; }
        .quikit-auth-wrap .fp-progress { display:flex; align-items:center; justify-content:center; gap:6px; margin-bottom:24px; }
        .quikit-auth-wrap .fp-progress-step { width:24px; height:4px; border-radius:99px; background:rgba(0,0,0,0.08); transition:background .25s; }
        .quikit-auth-wrap .fp-progress-step.active { background:#CDB18B; }
        .quikit-auth-wrap .fp-progress-step.done { background:#0D1117; }
        .quikit-auth-wrap .fp-otp { display:grid; grid-template-columns:repeat(6, 1fr); gap:10px; margin-bottom:8px; }
        .quikit-auth-wrap .fp-otp-input { width:100%; aspect-ratio:1 / 1.15; text-align:center; font-family:inherit; font-size:22px; font-weight:700; color:#0D1117; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; transition:border-color .15s, box-shadow .15s; outline:none; }
        .quikit-auth-wrap .fp-otp-input:focus { border-color:#CDB18B; box-shadow:0 0 0 3px rgba(205,177,139,0.18); }
        .quikit-auth-wrap .fp-otp-input.filled { border-color:#0D1117; background:#F7F7F4; }
        .quikit-auth-wrap .fp-resend { text-align:center; font-size:13px; color:#6B7280; margin-top:14px; }
        .quikit-auth-wrap .fp-resend-btn { background:none; border:none; padding:0; font:inherit; color:#0D1117; font-weight:600; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
        .quikit-auth-wrap .fp-resend-btn:disabled { color:#9CA3AF; cursor:not-allowed; text-decoration:none; }
        .quikit-auth-wrap .fp-resend-btn:not(:disabled):hover { color:#CDB18B; }
        .quikit-auth-wrap .fp-back-step { display:block; margin:14px auto 0; background:none; border:none; padding:0; font:inherit; font-size:13px; color:#6B7280; cursor:pointer; }
        .quikit-auth-wrap .fp-back-step:hover { color:#0D1117; }
        .quikit-auth-wrap .qk-modal-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px; animation:qkFadeInUp 0.2s ease-out both; }
        .quikit-auth-wrap .qk-modal { background:#fff; border-radius:20px; padding:36px 32px; max-width:380px; width:100%; display:flex; flex-direction:column; align-items:center; gap:16px; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.3); }
        .quikit-auth-wrap .qk-modal-close { position:absolute; top:12px; right:12px; background:none; border:none; cursor:pointer; padding:6px; color:#9CA3AF; border-radius:8px; display:flex; align-items:center; justify-content:center; }
        .quikit-auth-wrap .qk-modal-close:hover { background:rgba(0,0,0,0.05); color:#0D1117; }
        .quikit-auth-wrap .qk-modal-icon { width:56px; height:56px; border-radius:16px; display:flex; align-items:center; justify-content:center; }
        .quikit-auth-wrap .qk-modal-icon.loading { background:#F3F0E8; color:#CDB18B; }
        .quikit-auth-wrap .qk-modal-icon.error { background:#FEF2F2; color:#DC2626; }
        .quikit-auth-wrap .qk-modal-icon.success { background:#F3F0E8; color:#CDB18B; }
        .quikit-auth-wrap .qk-modal-title { font-size:16px; font-weight:700; color:#0D1117; text-align:center; }
        .quikit-auth-wrap .qk-modal-msg { font-size:13px; color:#6B7280; text-align:center; }
        .quikit-auth-wrap .qk-spin { animation:qk-spin 1s linear infinite; }
        @keyframes qk-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @media (max-width:900px) {
          .quikit-auth-wrap { height:auto; min-height:100vh; padding:16px; overflow:visible; }
          .quikit-auth-wrap .auth-layout { grid-template-columns:1fr; height:auto; min-height:calc(100vh - 32px); }
          .quikit-auth-wrap .auth-side { padding:28px 24px 40px; min-height:200px; }
          .quikit-auth-wrap .auth-main { padding:24px 20px 32px; height:auto; overflow:visible; }
          .quikit-auth-wrap .auth-main-top { margin-bottom:32px; }
          .quikit-auth-wrap .auth-foot { flex-direction:column; gap:12px; align-items:flex-start; margin-top:32px; }
          .quikit-auth-wrap .fp-otp { gap:8px; }
          .quikit-auth-wrap .fp-otp-input { font-size:18px; }
        }
        @media (max-width:480px) {
          .quikit-auth-wrap { padding:12px; }
          .quikit-auth-wrap .auth-layout { min-height:calc(100vh - 24px); gap:12px; }
          .quikit-auth-wrap .auth-side, .quikit-auth-wrap .auth-main { border-radius:18px; }
          .quikit-auth-wrap .auth-card h1 { font-size:22px; }
          .quikit-auth-wrap .auth-main { padding:20px 16px 28px; }
        }
      ` }} />

      <Confetti ref={confettiRef} manualstart className="fixed inset-0 pointer-events-none" style={{ zIndex: 9998 }} />

      {/* Status modal */}
      {modalStatus !== "closed" && (
        <div className="qk-modal-overlay">
          <div className="qk-modal">
            {(modalStatus === "error" || modalStatus === "success") && (
              <button type="button" className="qk-modal-close"
                onClick={() => { setModalStatus("closed"); setModalErrorMessage(""); }}
                aria-label="Close">
                <X size={18} />
              </button>
            )}
            {modalStatus === "loading" && (
              <>
                <div className="qk-modal-icon loading"><Loader size={24} className="qk-spin" /></div>
                <div className="qk-modal-title">Signing you in…</div>
                <div className="qk-modal-msg">Verifying your credentials</div>
              </>
            )}
            {modalStatus === "error" && (
              <>
                <div className="qk-modal-icon error"><AlertCircle size={24} /></div>
                <div className="qk-modal-title">Something went wrong</div>
                <div className="qk-modal-msg">{modalErrorMessage}</div>
                <button type="button" className="auth-submit" style={{ marginTop: 8 }}
                  onClick={() => { setModalStatus("closed"); setModalErrorMessage(""); }}>
                  Try again
                </button>
              </>
            )}
            {modalStatus === "success" && (
              <>
                <div className="qk-modal-icon success"><PartyPopper size={24} /></div>
                <div className="qk-modal-title">Welcome back!</div>
                <div className="qk-modal-msg">Redirecting to your dashboard…</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="auth-layout">
        {/* ─── Left brand panel ─── */}
        <aside className="auth-side">
          <button type="button" className="auth-back" aria-label="Back to home"
            onClick={() => { if (hardNavigate) window.location.assign("/"); else router.push("/"); }}>
            <ArrowLeft size={18} />
          </button>
        </aside>

        {/* ─── Right auth panel ─── */}
        <section className="auth-main">
          <header className="auth-main-top fade-in-up d1">
            <a href="/" className="auth-logo" aria-label={brandName}>
              <img src="/auth/quikit-logo-dark.png" alt={brandName} width={120} height={32} />
            </a>
          </header>

          <div className="auth-card fade-in-up d2">
            {banner && (
              <div className="auth-banner">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ flex: 1 }}>{banner}</span>
                <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss"><X size={14} /></button>
              </div>
            )}

            {/* ── Forgot-password progress dots ── */}
            {isForgotFlow && (
              <div className="fp-progress" aria-hidden="true">
                <div className={"fp-progress-step " + (fpStepIndex > 1 ? "done" : "active")} />
                <div className={"fp-progress-step " + (fpStepIndex === 2 ? "active" : fpStepIndex > 2 ? "done" : "")} />
                <div className={"fp-progress-step " + (fpStepIndex === 3 ? "active" : "")} />
              </div>
            )}

            {/* ════════════ LOGIN STEP ════════════ */}
            {authStep === "login" && (
              <>
                <h1>Welcome back to {brandName}!</h1>
                <p className="auth-sub">Please enter your details to sign in to your account</p>

                <button type="button" className="auth-oauth" onClick={() => handleSocialSignIn("google")}>
                  <GoogleIcon /> Continue with Google
                </button>
                <button type="button" className="auth-oauth" onClick={() => handleSocialSignIn("microsoft")}>
                  <MicrosoftIcon /> Continue with Microsoft
                </button>

                <div className="auth-divider"><span>Or sign in with</span></div>

                <form onSubmit={handleNativeSignIn} noValidate>
                  <div className="auth-field">
                    <label htmlFor="login-email">Email</label>
                    <input id="login-email" type="email" placeholder="you@company.com"
                      autoComplete="email" value={email}
                      onChange={(e) => setEmail(e.target.value)} />
                  </div>

                  <div className="auth-field">
                    <label htmlFor="login-password">Password</label>
                    <div className="auth-password">
                      <input id="login-password" ref={passwordInputRef}
                        type={showPassword ? "text" : "password"}
                        placeholder="minimum 8 characters"
                        autoComplete="current-password" value={password}
                        onChange={(e) => setPassword(e.target.value)} />
                      <button type="button" className="auth-eye"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="auth-submit"
                    disabled={modalStatus === "loading"}>
                    Sign In →
                  </button>
                </form>

                <button type="button" className="auth-forgot"
                  onClick={() => setAuthStep("forgot-email")}>
                  Forgot password?
                </button>
              </>
            )}

            {/* ════════════ PROFILE STEP ════════════ */}
            {authStep === "profile" && (
              <>
                <h1>Confirm your name</h1>
                <p className="auth-sub">We&apos;ll show this on your account and to teammates.</p>

                <form onSubmit={submitProfile} noValidate>
                  <div className="auth-field">
                    <label htmlFor="first-name">First name</label>
                    <input id="first-name" ref={firstNameInputRef} type="text"
                      autoComplete="given-name" value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane" />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="last-name">Last name</label>
                    <input id="last-name" type="text" autoComplete="family-name"
                      value={lastName} onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe" />
                  </div>
                  {profileError && <p className="auth-error">{profileError}</p>}
                  <button type="submit" className="auth-submit"
                    disabled={!isProfileValid || savingProfile}>
                    {savingProfile ? "Saving…" : "Save & Continue →"}
                  </button>
                </form>
              </>
            )}

            {/* ════════════ FORGOT-EMAIL STEP ════════════ */}
            {authStep === "forgot-email" && (
              <>
                <h1>Forgot your password?</h1>
                <p className="auth-sub">Enter the email you used to sign up. We&apos;ll send a 6-digit code to reset your password.</p>

                <form onSubmit={async (e) => { e.preventDefault(); await startForgotPassword(); }} noValidate>
                  <div className="auth-field">
                    <label htmlFor="fp-email">Email</label>
                    <input id="fp-email" type="email" placeholder="you@company.com"
                      autoComplete="email" value={email}
                      onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  {otpError && <p className="auth-error">{otpError}</p>}
                  <button type="submit" className="auth-submit"
                    disabled={!isEmailValid || otpSending}>
                    {otpSending ? "Sending…" : "Send code →"}
                  </button>
                </form>

                <button type="button" className="fp-back-step" onClick={goBackToLogin}>
                  ← Back to sign in
                </button>
              </>
            )}

            {/* ════════════ RESET PASSWORD STEP (3-field) ════════════ */}
            {/*
              Reached after the user submits their email on the
              `forgot-email` step. Backend has just reset the password to
              DEFAULT_RESET_PASSWORD and emailed it. User types:
                - that temporary password
                - their chosen new password
                - confirmation
              Submit chains: signIn(temp) → /api/auth/me/set-password →
              re-signIn(new) → navigate. See `submitResetPassword`.
            */}
            {authStep === "forgot-otp" && (
              <>
                <h1>Reset your password</h1>
                <p className="auth-sub">
                  We sent a temporary password to <strong>{email}</strong>.
                </p>

                <form onSubmit={submitResetPassword} noValidate>
                  <div className="auth-field">
                    <label htmlFor="reset-temp">Temporary password</label>
                    <div className="auth-password">
                      <input
                        id="reset-temp"
                        type={showTempPassword ? "text" : "password"}
                        placeholder="From your email"
                        autoComplete="one-time-code"
                        value={tempPassword}
                        onChange={(e) => setTempPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-eye"
                        onClick={() => setShowTempPassword((v) => !v)}
                        aria-label={
                          showTempPassword ? "Hide temporary password" : "Show temporary password"
                        }
                      >
                        {showTempPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="auth-field">
                    <label htmlFor="reset-new">New password</label>
                    <div className="auth-password">
                      <input
                        id="reset-new"
                        ref={newPasswordInputRef}
                        type={showNewPassword ? "text" : "password"}
                        placeholder="minimum 8 characters"
                        autoComplete="new-password"
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-eye"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? "Hide password" : "Show password"}
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {newPassword.length > 0 && newPassword.length < 8 && (
                      <p className="auth-error">Must be at least 8 characters.</p>
                    )}
                  </div>

                  <div className="auth-field">
                    <label htmlFor="reset-confirm">Confirm new password</label>
                    <div className="auth-password">
                      <input
                        id="reset-confirm"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="re-enter password"
                        autoComplete="new-password"
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                    {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                      <p className="auth-error">Passwords don&apos;t match.</p>
                    )}
                  </div>

                  {resetError && <p className="auth-error">{resetError}</p>}

                  <button
                    type="submit"
                    className="auth-submit"
                    disabled={
                      resetSubmitting ||
                      tempPassword.trim().length === 0 ||
                      newPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                  >
                    {resetSubmitting ? "Updating…" : "Reset password →"}
                  </button>
                </form>

                <div className="fp-resend" style={{ marginTop: 16 }}>
                  Didn&apos;t receive it?{" "}
                  <button
                    type="button"
                    className="fp-resend-btn"
                    disabled={otpSending || otpSecondsLeft > 0}
                    onClick={sendOtp}
                  >
                    {otpSending
                      ? "Sending…"
                      : otpSecondsLeft > 0
                      ? `Resend in ${formatCountdown(otpSecondsLeft)}`
                      : "Resend temporary password"}
                  </button>
                </div>

                <button
                  type="button"
                  className="fp-back-step"
                  onClick={() => {
                    setAuthStep("forgot-email");
                    setTempPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setOtpDigits(["", "", "", "", "", ""]);
                    setOtpError(null);
                    setOtpExpiresAt(null);
                    setResetError(null);
                  }}
                >
                  ← Use a different email
                </button>
              </>
            )}

            {/* ════════════ NEW PASSWORD STEP ════════════ */}
            {authStep === "new-password" && (
              <>
                <h1>Set a new password</h1>
                <p className="auth-sub">Choose a strong password with at least 8 characters.</p>

                <form onSubmit={submitNewPassword} noValidate>
                  <div className="auth-field">
                    <label htmlFor="np-password">New password</label>
                    <div className="auth-password">
                      <input id="np-password" ref={newPasswordInputRef}
                        type={showNewPassword ? "text" : "password"}
                        placeholder="minimum 8 characters"
                        autoComplete="new-password" minLength={8}
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                      <button type="button" className="auth-eye"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? "Hide password" : "Show password"}>
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="auth-field">
                    <label htmlFor="np-confirm">Confirm password</label>
                    <div className="auth-password">
                      <input id="np-confirm"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="re-enter password"
                        autoComplete="new-password" minLength={8}
                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </div>
                  </div>

                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="auth-error">Passwords don&apos;t match.</p>
                  )}
                  {resetError && <p className="auth-error">{resetError}</p>}

                  <button type="submit" className="auth-submit"
                    disabled={!isNewPasswordValid || resetSubmitting}>
                    {resetSubmitting ? "Updating…" : "Update password →"}
                  </button>
                </form>

                <button type="button" className="fp-back-step" onClick={goBackToLogin}>
                  ← Cancel
                </button>
              </>
            )}

            {/* ════════════ INVITATION STEP ════════════ */}
            {authStep === "invitation" && (
              <>
                {invitationLoading ? (
                  <>
                    <h1>Loading invitation…</h1>
                    <p className="auth-sub">Please wait while we verify your invite.</p>
                  </>
                ) : invitationError ? (
                  <>
                    <h1>Invitation problem</h1>
                    <p className="auth-sub">{invitationError}</p>
                    <button type="button" className="auth-submit"
                      onClick={() => { if (hardNavigate) window.location.assign("/login"); else router.push("/login"); }}>
                      Go to sign in
                    </button>
                  </>
                ) : (
                  <>
                    <h1>Welcome to {invitationData?.orgName ?? brandName}</h1>
                    <p className="auth-sub">
                      Hi {invitationData?.firstName || "there"}, set your password to activate your account at <strong>{invitationData?.email}</strong>.
                    </p>

                    <form onSubmit={submitInvitation} noValidate>
                      <div className="auth-field">
                        <label htmlFor="inv-current">Current (temporary) password</label>
                        <div className="auth-password">
                          <input id="inv-current"
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="default password from your invite email"
                            autoComplete="current-password"
                            value={inviteCurrentPassword}
                            onChange={(e) => setInviteCurrentPassword(e.target.value)} />
                        </div>
                      </div>

                      <div className="auth-field">
                        <label htmlFor="inv-new">New password</label>
                        <div className="auth-password">
                          <input id="inv-new"
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="min 8 chars, 1 uppercase, 1 number, 1 special"
                            autoComplete="new-password" minLength={8} maxLength={200}
                            value={inviteNewPassword}
                            onChange={(e) => setInviteNewPassword(e.target.value)} />
                          <button type="button" className="auth-eye"
                            onClick={() => setInviteShowPassword((v) => !v)}
                            aria-label={inviteShowPassword ? "Hide password" : "Show password"}>
                            {inviteShowPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>

                      <div className="auth-field">
                        <label htmlFor="inv-confirm">Confirm new password</label>
                        <div className="auth-password">
                          <input id="inv-confirm"
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="re-enter password"
                            autoComplete="new-password" minLength={8} maxLength={200}
                            value={inviteConfirmPassword}
                            onChange={(e) => setInviteConfirmPassword(e.target.value)} />
                        </div>
                      </div>

                      {inviteConfirmPassword.length > 0 && inviteNewPassword !== inviteConfirmPassword && (
                        <p className="auth-error">Passwords don&apos;t match.</p>
                      )}
                      {inviteFormError && <p className="auth-error">{inviteFormError}</p>}

                      <button type="submit" className="auth-submit" disabled={inviteSubmitting}>
                        {inviteSubmitting ? "Saving…" : "Save & Continue →"}
                      </button>
                      <button type="button" className="auth-secondary"
                        onClick={skipInvitation} disabled={inviteSubmitting}>
                        Skip for now
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </div>

          <footer className="auth-foot">
            <span>© {new Date().getFullYear()} {brandName}</span>
            <span className="auth-foot-links">
              <a href="/privacy">Privacy Policy</a>
              <a href="/support">Support</a>
            </span>
          </footer>
        </section>
      </div>
    </div>
  );
};
