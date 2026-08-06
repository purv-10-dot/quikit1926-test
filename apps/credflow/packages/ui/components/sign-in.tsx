"use client";

import { cn } from "../lib/utils";
import React, {
  useState, useRef, useEffect, forwardRef,
  useImperativeHandle, useMemo, useCallback, Children,
} from "react";
import {
  ArrowRight, Mail, Lock, Eye, EyeOff,
  ArrowLeft, X, AlertCircle, PartyPopper, Loader,
  TrendingUp, Target, BarChart3, Zap, User as UserIcon,
} from "lucide-react";
import { AnimatePresence, motion, useInView, Variants, Transition } from "framer-motion";
import { useRouter } from "next/navigation";
import { signIn as nextAuthSignIn } from "next-auth/react";
import type { GlobalOptions as ConfettiGlobalOptions, CreateTypes as ConfettiInstance, Options as ConfettiOptions } from "canvas-confetti";
import confetti from "canvas-confetti";
import ParticlesBg from "./particles-bg";

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

/* ─── TextLoop ─── */
type TextLoopProps = {
  children: React.ReactNode[];
  className?: string;
  interval?: number;
  transition?: Transition;
  variants?: Variants;
  onIndexChange?: (index: number) => void;
  stopOnEnd?: boolean;
};
function TextLoop({ children, className, interval = 2, transition = { duration: 0.3 }, variants, onIndexChange, stopOnEnd = false }: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const items = Children.toArray(children);
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((current) => {
        if (stopOnEnd && current === items.length - 1) { clearInterval(timer); return current; }
        const next = (current + 1) % items.length;
        onIndexChange?.(next);
        return next;
      });
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [items.length, interval, onIndexChange, stopOnEnd]);
  const motionVariants: Variants = {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 },
  };
  return (
    <div className={cn("relative inline-block whitespace-nowrap", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={currentIndex} initial="initial" animate="animate" exit="exit" transition={transition} variants={variants || motionVariants}>
          {items[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─── BlurFade ─── */
interface BlurFadeProps {
  children: React.ReactNode; className?: string;
  duration?: number; delay?: number; yOffset?: number;
  inView?: boolean; inViewMargin?: string; blur?: string;
}
function BlurFade({ children, className, duration = 0.4, delay = 0, yOffset = 6, inView = true, inViewMargin = "-50px", blur = "6px" }: BlurFadeProps) {
  const ref = useRef(null);
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin });
  const isInView = !inView || inViewResult;
  const defaultVariants: Variants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: -yOffset, opacity: 1, filter: "blur(0px)" },
  };
  return (
    <motion.div ref={ref} initial="hidden" animate={isInView ? "visible" : "hidden"} exit="hidden"
      variants={defaultVariants} transition={{ delay: 0.04 + delay, duration, ease: "easeOut" }} className={className}>
      {children}
    </motion.div>
  );
}

/* ─── Icons ─── */
const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="w-5 h-5 flex-shrink-0">
    <g fillRule="evenodd" fill="none"><g fillRule="nonzero" transform="translate(3,2)">
      <path fill="#4285F4" d="M57.8 30.15c0-2.43-.2-4.19-.62-6.03H29.5v10.95h16.25c-.33 2.72-2.1 6.82-6.03 9.57l-.05.37 8.76 6.78.6.06C54.6 46.7 57.8 39.13 57.8 30.15"/>
      <path fill="#34A853" d="M29.5 59c7.96 0 14.65-2.62 19.53-7.14l-9.3-7.21c-2.49 1.74-5.83 2.95-10.23 2.95-7.8 0-14.42-5.14-16.78-12.26l-.35.03-9.1 7.05-.12.33C7.997 52.37 17.96 59 29.5 59"/>
      <path fill="#FBBC05" d="M12.72 35.33A18.27 18.27 0 0 1 11.73 29.5c0-2.03.37-4-.68-5.84l-.35-.38-9.22-7.16-.3.14A29.5 29.5 0 0 0 0 29.5c0 4.75 1.15 9.24 3.15 13.24l9.57-7.41"/>
      <path fill="#EB4335" d="M29.5 11.4c5.53 0 9.27 2.39 11.4 4.39l8.32-8.12C44.11 2.92 37.46 0 29.5 0 17.96 0 7.997 6.62 3.15 16.26l9.57 7.4C15.08 16.55 21.7 11.4 29.5 11.4"/>
    </g></g>
  </svg>
);

const MicrosoftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0">
    <rect x="2" y="2" width="9" height="9" fill="#F25022"/>
    <rect x="13" y="2" width="9" height="9" fill="#7FBA00"/>
    <rect x="2" y="13" width="9" height="9" fill="#00A4EF"/>
    <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
  </svg>
);

/* ─── Main Component ─── */
interface SignInComponentProps {
  logo?: React.ReactNode;
  brandName?: string;
  /** Path/URL to redirect after successful sign-in (default: "/apps").
   *  Apps without a local /apps (e.g. the auth IdP host) MUST pass an
   *  absolute launcher URL here. */
  redirectPath?: string;
  /** Optional absolute/relative URL that overrides redirectPath (usually from ?callbackUrl=) */
  callbackUrl?: string | null;
  /** Inline banner message shown above the form (e.g. session_expired reason) */
  initialError?: string | null;
  /** When true, use window.location.assign for navigation (hard nav). Default true to avoid session flicker. */
  hardNavigate?: boolean;
  /**
   * Open the component on a step other than "email". Used after an OAuth
   * round-trip to land directly on the profile-confirmation step
   * (`/login?step=profile`), or for the native-invite landing page which
   * opens straight on the "Set your password" step (`initialStep="invitation"`).
   */
  initialStep?: "email" | "password" | "profile" | "forgot-otp" | "new-password" | "invitation";
  /**
   * Single-use invitation token (from `?token=…`). Required when
   * `initialStep="invitation"`. The component fetches the invitation on
   * mount, renders the Set-Password form, and on submit POSTs to
   * `/api/invitations/accept` to activate the membership before signing
   * the user in. Ignored for any other step.
   */
  invitationToken?: string | null;
  /**
   * Where to send the user after a successful invitation accept (Save &
   * Continue). Defaults to `redirectPath`. Skip-for-now always sends the
   * user to `/login` so they sign in manually with the default password.
   */
  invitationLauncherUrl?: string;
}

export const SignInComponent = ({
  logo,
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authStep, setAuthStep] = useState<"email" | "password" | "profile" | "forgot-otp" | "new-password" | "invitation">(initialStep ?? "email");
  const [modalStatus, setModalStatus] = useState<"closed" | "loading" | "error" | "success">("closed");
  const [modalErrorMessage, setModalErrorMessage] = useState("");
  const [banner, setBanner] = useState<string | null>(initialError ?? null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  // Forgot-password flow state
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
  // Invitation (native invite "Set your password" step) state
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

  /**
   * After a successful credentials sign-in, ask the auth service whether the
   * user has a first/last name on file. If yes, redirect to the launcher as
   * before. If no (super-admin-added accounts start with empty names), close
   * the loading modal and advance to the inline profile step. This is the
   * authoritative profile gate (the old /select-org interstitial that used
   * to re-check is gone). On a transient fetch error we fall through to the
   * redirect — the user is still authenticated and can set their name from
   * settings; the login flow itself is never blocked.
   */
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

  const runSignIn = async (email?: string, password?: string) => {
    setModalStatus("loading");
    // Use demo credentials for social sign-in (mock flow)
    const signInEmail = email || "ceo@demo.com";
    const signInPassword = password || "password123";
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
        // 429 throttle is the only non-200 we surface to the user.
        setOtpError(data?.error || "Could not send code. Try again shortly.");
        return false;
      }
      const ttl: number = typeof data?.expiresInSeconds === "number" ? data.expiresInSeconds : 180;
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpExpiresAt(Date.now() + ttl * 1000);
      setOtpSecondsLeft(ttl);
      return true;
    } catch {
      setOtpError("Network error. Try again.");
      return false;
    } finally {
      setOtpSending(false);
    }
  };

  const startForgotPassword = async () => {
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
        // Clear digits so the user can retype without backspacing.
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
      // Auto sign-in with the new password so the user lands on /apps without
      // typing it a third time.
      const signInResult = await nextAuthSignIn("credentials", {
        email,
        password: newPassword,
        redirect: false,
      });
      if (!signInResult?.ok) {
        // Edge case: password updated but sign-in failed (e.g. bad rate limit
        // bucket). Send the user to the password step with a helpful message.
        setBanner("Password updated. Please sign in with your new password.");
        setAuthStep("password");
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

  /* ─── Native-invite acceptance flow (initialStep="invitation") ─────── */

  /**
   * On mount, fetch the invitation by token so we can show org/user
   * context (and surface invalid/expired tokens before the user types a
   * password). Re-runs only if the token prop ever changes — in practice
   * the page hosting this component reads the token from the URL once.
   */
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

      // Auto sign-in with the new credentials so the user lands on the
      // launcher without re-typing them. The success modal mirrors the
      // normal post-login UX.
      setModalStatus("loading");
      const signInResult = await nextAuthSignIn("credentials", {
        email: json.data?.email ?? invitationData?.email ?? "",
        password: inviteNewPassword,
        redirect: false,
      });
      if (!signInResult?.ok) {
        setModalStatus("closed");
        setBanner("Password set. Please sign in with your new password.");
        setAuthStep("email");
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
      // Skip path: send the user to /login with their email pre-filled so
      // they can sign in manually with the default password (FR-SA-010).
      setBanner("Invitation accepted. Sign in to continue.");
      setEmail(json.data?.email ?? invitationData?.email ?? "");
      setAuthStep("email");
      setInviteSubmitting(false);
    } catch {
      setInviteFormError("Network error. Please try again.");
      setInviteSubmitting(false);
    }
  };

  /**
   * Kick off a real OAuth round-trip with NextAuth. The browser navigates
   * away to Google/Microsoft, comes back through `/api/auth/callback/<p>`,
   * and lands DIRECTLY on `/login?step=profile`.
   *
   * OAuth goes straight to the profile-confirmation form (unconditional,
   * impossible to bypass — historically intermediate redirects lost the
   * `fromOAuth` flag depending on browser cache / NextAuth URL handling).
   * After the form is submitted the post-save navigation falls back to
   * `redirectPath` (the launcher `/apps`), which ships the user to the
   * launcher with now-populated DB names.
   *
   * The "microsoft" prop name is the public-facing label; the NextAuth
   * provider id is `azure-ad`.
   */
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

  const handleProgressStep = () => {
    if (authStep === "email" && isEmailValid) setAuthStep("password");
    else if (authStep === "password" && isPasswordValid) runSignIn();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleProgressStep(); }
  };

  useEffect(() => {
    if (authStep === "password") setTimeout(() => passwordInputRef.current?.focus(), 400);
    if (authStep === "profile") setTimeout(() => firstNameInputRef.current?.focus(), 400);
    if (authStep === "forgot-otp") setTimeout(() => otpInputRefs.current[0]?.focus(), 400);
    if (authStep === "new-password") setTimeout(() => newPasswordInputRef.current?.focus(), 400);
  }, [authStep]);

  // When the profile step opens with empty inputs, ask the auth service
  // for pre-fill data. Priority:
  //   1. `suggested*` (Google / Microsoft) — freshest source for OAuth
  //      logins, set by the signIn callback into the OAuth pre-fill store.
  //   2. DB `firstName` / `lastName` — fallback for credentials users or
  //      when the suggestion store has nothing.
  // Either way, `firstName`/`lastName` state become editable defaults the
  // user can keep or edit.
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

  // Countdown ticker for the OTP step. Re-arms on every send (`otpExpiresAt`
  // bumps), stops when zero or when we leave the step.
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

  // Auto-submit the OTP the moment all 6 digits are filled — the user never
  // needs to click anything in the happy path.
  useEffect(() => {
    if (authStep === "forgot-otp" && isOtpComplete && !otpVerifying && otpSecondsLeft > 0) {
      verifyOtpDigits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue, authStep]);

  /* ─── OTP digit input handlers ─────────────────────────────────────── */

  const handleOtpChange = (index: number, raw: string) => {
    // Strip non-digits in case of paste / IME quirks
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 0) {
      const next = [...otpDigits];
      next[index] = "";
      setOtpDigits(next);
      return;
    }
    if (digits.length > 1) {
      // Multi-character input (paste) — distribute across boxes from `index`.
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

  const modalSteps = [
    { message: "Verifying your identity…" },
    { message: "Setting things up…" },
  ];
  const TEXT_LOOP_INTERVAL = 0.9;

  /* ─── Features shown on left panel ─── */
  const features = [
    { icon: Target, label: "QuikScale", desc: "KPI tracking, OKRs & goal alignment for scaling teams" },
    { icon: BarChart3, label: "Performance Management", desc: "Reviews, talent mapping & team performance insights" },
    { icon: TrendingUp, label: "Payroll & HR", desc: "Streamlined payroll, attendance & employee management" },
    { icon: Zap, label: "And More", desc: "New apps added regularly — one subscription, full access" },
  ];

  return (
    <div className="min-h-screen w-screen flex bg-[#0a0a0f] overflow-hidden">
      {/* ── CSS ── */}
      {/*
        Use dangerouslySetInnerHTML so the CSS string is emitted byte-identical
        on server and client. With <style>{cssString}</style>, React escapes
        ', ", &, <, > in the text node on the server (e.g. ' → &#x27;) but
        renders them raw on the client — producing a hydration mismatch and
        breaking @import url('...') because the browser parses the escaped
        server output literally.
      */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');

        input:-webkit-autofill,input:-webkit-autofill:hover,input:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 30px transparent inset!important;-webkit-text-fill-color:#fff!important;transition:background-color 5000s ease-in-out 0s!important;}
        input[type="password"]::-ms-reveal,input[type="password"]::-ms-clear{display:none!important;}

        @property --angle-1{syntax:"<angle>";inherits:false;initial-value:-75deg;}
        @property --angle-2{syntax:"<angle>";inherits:false;initial-value:-45deg;}

        .gi-wrap{--t:400ms cubic-bezier(0.25,1,0.5,1);--bw:1px;position:relative;border-radius:9999px;z-index:2;}
        .gi{display:flex;align-items:center;gap:.5rem;border-radius:9999px;padding:.3rem;backdrop-filter:blur(4px);transition:all 400ms cubic-bezier(0.25,1,0.5,1);background:linear-gradient(-75deg,rgba(255,255,255,.03),rgba(255,255,255,.08),rgba(255,255,255,.03));box-shadow:inset 0 1px 1px rgba(255,255,255,.06),0 1px 6px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.06) inset;}
        .gi-wrap:focus-within .gi{box-shadow:inset 0 1px 1px rgba(255,255,255,.08),0 1px 6px rgba(0,0,0,.3),0 0 0 1px rgba(139,92,246,.5) inset,0 0 20px rgba(139,92,246,.08);}
        .gi::after{content:"";position:absolute;inset:0;border-radius:9999px;width:calc(100% + 1px);height:calc(100% + 1px);top:-.5px;left:-.5px;padding:1px;box-sizing:border-box;background:conic-gradient(from var(--angle-1) at 50% 50%,rgba(255,255,255,.3) 0%,transparent 5% 40%,rgba(255,255,255,.3) 50%,transparent 60% 95%,rgba(255,255,255,.3) 100%),linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.08));mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;pointer-events:none;transition:all 400ms cubic-bezier(0.25,1,0.5,1),--angle-1 500ms ease;}
        .gi-wrap:focus-within .gi::after{--angle-1:-125deg;}

        .gb-wrap{--t:350ms cubic-bezier(0.25,1,0.5,1);--bw:1px;position:relative;border-radius:9999px;z-index:2;transform-style:preserve-3d;transition:transform var(--t);}
        .gb-wrap:has(.gb:active){transform:rotateX(20deg);}
        .gb{position:relative;border-radius:9999px;cursor:pointer;backdrop-filter:blur(4px);transition:all var(--t);background:linear-gradient(-75deg,rgba(255,255,255,.03),rgba(255,255,255,.09),rgba(255,255,255,.03));box-shadow:inset 0 1px 1px rgba(255,255,255,.07),0 1px 8px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.07) inset;}
        .gb:hover{transform:scale(0.97);box-shadow:inset 0 1px 1px rgba(255,255,255,.1),0 2px 12px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.12) inset;}
        .gb::after{content:"";position:absolute;inset:0;border-radius:9999px;width:calc(100% + 1px);height:calc(100% + 1px);top:-.5px;left:-.5px;padding:1px;box-sizing:border-box;background:conic-gradient(from var(--angle-1) at 50% 50%,rgba(255,255,255,.25) 0%,transparent 5% 40%,rgba(255,255,255,.25) 50%,transparent 60% 95%,rgba(255,255,255,.25) 100%),linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.06));mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;pointer-events:none;transition:all var(--t),--angle-1 500ms ease;}
        .gb:hover::after{--angle-1:-125deg;}
        .gb-shadow{--cut:2em;position:absolute;width:calc(100% + var(--cut));height:calc(100% + var(--cut));top:calc(-1 * var(--cut)/2);left:calc(-1 * var(--cut)/2);filter:blur(8px);pointer-events:none;}
        .gb-shadow::after{content:"";position:absolute;inset:0;border-radius:9999px;background:linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.05));width:calc(100% - var(--cut) - .25em);height:calc(100% - var(--cut) - .25em);top:calc(var(--cut) - .5em);left:calc(var(--cut) - .875em);padding:.125em;box-sizing:border-box;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;}
      ` }} />

      <Confetti ref={confettiRef} manualstart className="fixed inset-0 pointer-events-none z-[999]" />

      {/* ── Loading / Error / Success Modal ── */}
      <AnimatePresence>
        {modalStatus !== "closed" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
            <motion.div initial={{ scale: 0.88, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="relative bg-white/5 border border-white/10 backdrop-blur-2xl rounded-3xl p-10 w-full max-w-sm flex flex-col items-center gap-5 mx-4 shadow-2xl">
              {(modalStatus === "error" || modalStatus === "success") && (
                <button onClick={() => { setModalStatus("closed"); setModalErrorMessage(""); }}
                  className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
              {modalStatus === "loading" && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                    <Loader className="w-8 h-8 text-white animate-spin" />
                  </div>
                  <div className="text-center">
                    <TextLoop interval={TEXT_LOOP_INTERVAL} stopOnEnd={false}>
                      {modalSteps.map((s, i) => <p key={i} className="text-white font-semibold text-lg">{s.message}</p>)}
                    </TextLoop>
                    <p className="text-white/40 text-sm mt-1">Please wait a moment</p>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                      initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.8, ease: "easeInOut" }} />
                  </div>
                </>
              )}
              {modalStatus === "error" && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-lg">Something went wrong</p>
                    <p className="text-white/50 text-sm mt-1">{modalErrorMessage}</p>
                  </div>
                  <button onClick={() => { setModalStatus("closed"); setModalErrorMessage(""); }}
                    className="px-6 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-xl text-sm font-medium transition-colors">
                    Try again
                  </button>
                </>
              )}
              {modalStatus === "success" && (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <PartyPopper className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-lg">Welcome back!</p>
                    <p className="text-white/50 text-sm mt-1">Redirecting to your dashboard…</p>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════ LEFT PANEL ══════════════ */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] relative overflow-hidden p-12">
        {/* Animated particle network background */}
        <ParticlesBg
          particleColor="#a78bfa"
          lineColor="#7c3aed"
          accentColor="#6d28d9"
          className="absolute inset-0 z-0 pointer-events-auto"
        />
        {/* Background blobs */}
        <div className="absolute inset-0 z-[1] pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-violet-600/25 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[100px]" />
          <div className="absolute top-[40%] left-[30%] w-[350px] h-[350px] rounded-full bg-fuchsia-600/15 blur-[90px]" />
        </div>
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 z-[1] opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <span className="text-white font-bold text-base">Q</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">{brandName}</span>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <BlurFade delay={0.1}>
              <p className="text-white/50 text-sm font-medium tracking-widest uppercase">Multiple Solutions, One Platform</p>
            </BlurFade>
            <BlurFade delay={0.2}>
              <h1 className="text-5xl xl:text-6xl font-light text-white leading-[1.1] tracking-tight"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                All your apps,<br />
                <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-indigo-300">
                  one place.
                </span>
              </h1>
            </BlurFade>
            <BlurFade delay={0.3}>
              <p className="text-white/45 text-lg leading-relaxed max-w-md">
                Your one-stop platform to access QuikScale, PMS, Payroll, and every business app your team needs — all under one subscription.
              </p>
            </BlurFade>
          </div>

          {/* Feature pills */}
          <BlurFade delay={0.4}>
            <div className="grid grid-cols-2 gap-3">
              {features.map((f, i) => (
                <motion.div key={f.label}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                  className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07] backdrop-blur-sm hover:bg-white/[0.06] transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <f.icon className="w-4 h-4 text-violet-300" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{f.label}</p>
                    <p className="text-white/40 text-xs mt-0.5 leading-snug">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </BlurFade>
        </div>

        {/* Bottom testimonial */}
        <BlurFade delay={0.6} className="relative z-10">
          <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
            <div className="flex -space-x-2">
              {["#7C3AED","#4F46E5","#0EA5E9"].map((c, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0a0a0f] flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: c }}>
                  {["A","B","C"][i]}
                </div>
              ))}
            </div>
            <div>
              <p className="text-white/80 text-sm font-medium">&ldquo;One login, every tool we need&rdquo;</p>
              <p className="text-white/35 text-xs mt-0.5">Trusted by growing teams worldwide</p>
            </div>
          </div>
        </BlurFade>
      </div>

      {/* ══════════════ RIGHT PANEL ══════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-12">
        {/* Subtle right-panel background */}
        <div className="absolute inset-0 bg-white/[0.02]" />
        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-10 relative z-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <span className="text-white font-bold text-base">Q</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">{brandName}</span>
        </div>

        <div className="relative z-10 w-full max-w-[360px]">
          {banner && (
            <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-300" />
              <span className="flex-1">{banner}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-red-300/70 hover:text-red-200 transition-colors flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <AnimatePresence mode="wait">
            {authStep === "email" && (
              <motion.div key="email-step" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: "easeOut" }} className="space-y-8">

                {/* Heading */}
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold text-white tracking-tight"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Welcome back
                  </h2>
                  <p className="text-white/45 text-sm">Sign in to continue to {brandName}</p>
                </div>

                {/* Social buttons */}
                <div className="space-y-3">
                  <button onClick={() => handleSocialSignIn("google")}
                    className="gb w-full flex items-center gap-3 px-5 py-3.5 text-white/85 text-sm font-medium hover:text-white transition-colors">
                    <GoogleIcon />
                    <span className="flex-1 text-left">Continue with Google</span>
                    <ArrowRight className="w-4 h-4 opacity-40" />
                  </button>
                  <button onClick={() => handleSocialSignIn("microsoft")}
                    className="gb w-full flex items-center gap-3 px-5 py-3.5 text-white/85 text-sm font-medium hover:text-white transition-colors">
                    <MicrosoftIcon />
                    <span className="flex-1 text-left">Continue with Microsoft</span>
                    <ArrowRight className="w-4 h-4 opacity-40" />
                  </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-white/25 text-xs font-semibold tracking-wider uppercase">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Email input */}
                <div className="space-y-3">
                  <div className="gi-wrap w-full">
                    <div className="gi">
                      <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                        <Mail className="w-4 h-4 text-white/40" />
                      </div>
                      <input
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                        autoFocus
                      />
                      <AnimatePresence>
                        {isEmailValid && (
                          <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                            type="button" onClick={handleProgressStep}
                            className="w-8 h-8 mr-1 rounded-full bg-violet-600 hover:bg-violet-500 transition-colors flex items-center justify-center flex-shrink-0">
                            <ArrowRight className="w-4 h-4 text-white" />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleProgressStep}
                    disabled={!isEmailValid}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0">
                    Continue with Email
                  </button>
                </div>

                {/* Footer */}
                <p className="text-center text-white/25 text-xs">
                  By continuing, you agree to our{" "}
                  <span className="text-white/45 hover:text-white/70 cursor-pointer transition-colors">Terms</span>{" "}
                  and{" "}
                  <span className="text-white/45 hover:text-white/70 cursor-pointer transition-colors">Privacy Policy</span>
                </p>
              </motion.div>
            )}
            {authStep === "password" && (
              <motion.div key="password-step" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: "easeOut" }} className="space-y-8">

                {/* Heading */}
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold text-white tracking-tight"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Enter password
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-400" />
                    <p className="text-white/45 text-sm truncate max-w-[280px]">{email}</p>
                    <button onClick={() => { setAuthStep("email"); setPassword(""); }}
                      className="text-violet-400 hover:text-violet-300 transition-colors ml-auto text-xs font-medium flex-shrink-0">
                      Change
                    </button>
                  </div>
                </div>

                {/* Password input */}
                <form onSubmit={handleNativeSignIn} className="space-y-3">
                  <div className="gi-wrap w-full">
                    <div className="gi">
                      <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                        {isPasswordValid
                          ? <button type="button" onClick={() => setShowPassword(v => !v)} className="text-white/40 hover:text-white/70 transition-colors p-1">
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          : <Lock className="w-4 h-4 text-white/40" />
                        }
                      </div>
                      <input
                        ref={passwordInputRef}
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                      />
                      <AnimatePresence>
                        {isPasswordValid && (
                          <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                            type="submit"
                            className="w-8 h-8 mr-1 rounded-full bg-violet-600 hover:bg-violet-500 transition-colors flex items-center justify-center flex-shrink-0">
                            <ArrowRight className="w-4 h-4 text-white" />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={startForgotPassword}
                      disabled={!isEmailValid || otpSending}
                      className="text-violet-400 hover:text-violet-300 disabled:text-white/25 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                    >
                      {otpSending ? "Sending code…" : "Forgot password?"}
                    </button>
                  </div>

                  <button type="submit" disabled={!isPasswordValid}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0">
                    Sign In
                  </button>
                </form>

                {/* Back */}
                <button type="button" onClick={() => { setAuthStep("email"); setPassword(""); }}
                  className="flex items-center gap-2 text-white/35 hover:text-white/70 transition-colors text-sm">
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in options
                </button>
              </motion.div>
            )}
            {authStep === "profile" && (
              <motion.div key="profile-step" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: "easeOut" }} className="space-y-8">

                {/* Heading */}
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold text-white tracking-tight"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Tell us your name
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-400" />
                    <p className="text-white/45 text-sm truncate max-w-[280px]">{email}</p>
                  </div>
                </div>

                {/* Name inputs */}
                <form onSubmit={submitProfile} className="space-y-3">
                  <div className="gi-wrap w-full">
                    <div className="gi">
                      <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-white/40" />
                      </div>
                      <input
                        ref={firstNameInputRef}
                        type="text"
                        placeholder="First name"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        maxLength={100}
                        autoComplete="given-name"
                        className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                      />
                    </div>
                  </div>

                  <div className="gi-wrap w-full">
                    <div className="gi">
                      <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-white/40" />
                      </div>
                      <input
                        type="text"
                        placeholder="Last name"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        maxLength={100}
                        autoComplete="family-name"
                        className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                      />
                    </div>
                  </div>

                  {profileError && (
                    <p className="text-xs text-red-300/90 px-1">{profileError}</p>
                  )}

                  <button type="submit" disabled={!isProfileValid || savingProfile}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0">
                    {savingProfile ? "Saving…" : "Continue"}
                  </button>
                </form>
              </motion.div>
            )}
            {authStep === "forgot-otp" && (
              <motion.div key="forgot-otp-step" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: "easeOut" }} className="space-y-8">

                {/* Heading */}
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold text-white tracking-tight"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Check your email
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-400" />
                    <p className="text-white/45 text-sm truncate max-w-[260px]">{email}</p>
                    <button onClick={() => { setAuthStep("password"); setOtpDigits(["","","","","",""]); setOtpError(null); setOtpExpiresAt(null); }}
                      className="text-violet-400 hover:text-violet-300 transition-colors ml-auto text-xs font-medium flex-shrink-0">
                      Change
                    </button>
                  </div>
                  <p className="text-white/45 text-sm">Enter the 6-digit code we just sent.</p>
                </div>

                {/* OTP boxes */}
                <div className="space-y-3">
                  <div className="flex justify-between gap-2">
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpInputRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete={i === 0 ? "one-time-code" : "off"}
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        onPaste={i === 0 ? handleOtpPaste : undefined}
                        disabled={otpVerifying || otpSecondsLeft === 0}
                        className="w-11 h-12 text-center text-xl font-semibold rounded-xl bg-white/[0.04] border border-white/15 text-white placeholder:text-white/20 focus:outline-none focus:border-violet-400 focus:bg-white/[0.07] transition-colors disabled:opacity-50"
                      />
                    ))}
                  </div>

                  {/* Countdown / resend */}
                  <div className="flex items-center justify-between text-xs">
                    {otpSecondsLeft > 0 ? (
                      <span className="text-white/45">
                        Code expires in <span className="text-violet-300 font-mono">{formatCountdown(otpSecondsLeft)}</span>
                      </span>
                    ) : (
                      <span className="text-white/45">Code expired.</span>
                    )}
                    <button
                      type="button"
                      onClick={sendOtp}
                      disabled={otpSending || otpSecondsLeft > 0}
                      className="text-violet-400 hover:text-violet-300 disabled:text-white/25 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {otpSending ? "Sending…" : otpSecondsLeft > 0 ? "Resend code" : "Send new code"}
                    </button>
                  </div>

                  {otpError && (
                    <p className="text-xs text-red-300/90 px-1">{otpError}</p>
                  )}

                  {otpVerifying && (
                    <p className="text-xs text-white/45 px-1">Verifying…</p>
                  )}
                </div>

                {/* Back */}
                <button type="button" onClick={() => { setAuthStep("password"); setOtpDigits(["","","","","",""]); setOtpError(null); setOtpExpiresAt(null); }}
                  className="flex items-center gap-2 text-white/35 hover:text-white/70 transition-colors text-sm">
                  <ArrowLeft className="w-4 h-4" />
                  Back to password
                </button>
              </motion.div>
            )}
            {authStep === "new-password" && (
              <motion.div key="new-password-step" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: "easeOut" }} className="space-y-8">

                {/* Heading */}
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold text-white tracking-tight"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                    Create a new password
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-400" />
                    <p className="text-white/45 text-sm truncate max-w-[280px]">{email}</p>
                  </div>
                </div>

                <form onSubmit={submitNewPassword} className="space-y-3">
                  <div className="gi-wrap w-full">
                    <div className="gi">
                      <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                        <button type="button" onClick={() => setShowNewPassword(v => !v)} className="text-white/40 hover:text-white/70 transition-colors p-1">
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <input
                        ref={newPasswordInputRef}
                        type={showNewPassword ? "text" : "password"}
                        placeholder="New password (min 8 characters)"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={200}
                        className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                      />
                    </div>
                  </div>

                  <div className="gi-wrap w-full">
                    <div className="gi">
                      <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                        <Lock className="w-4 h-4 text-white/40" />
                      </div>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={200}
                        className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                      />
                    </div>
                  </div>

                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="text-xs text-red-300/90 px-1">Passwords don&apos;t match.</p>
                  )}
                  {resetError && (
                    <p className="text-xs text-red-300/90 px-1">{resetError}</p>
                  )}

                  <button type="submit" disabled={!isNewPasswordValid || resetSubmitting}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0">
                    {resetSubmitting ? "Updating…" : "Update password"}
                  </button>
                </form>
              </motion.div>
            )}
            {authStep === "invitation" && (
              <motion.div key="invitation-step" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: "easeOut" }} className="space-y-8">

                {invitationLoading ? (
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold text-white tracking-tight"
                      style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                      Loading…
                    </h2>
                    <p className="text-white/45 text-sm">Validating your invitation.</p>
                  </div>
                ) : invitationError ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h2 className="text-3xl font-semibold text-white tracking-tight"
                        style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                        Invitation unavailable
                      </h2>
                      <p className="text-white/55 text-sm">{invitationError}</p>
                    </div>
                    <button type="button" onClick={() => { setAuthStep("email"); }}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-500/20">
                      Go to sign in
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Heading */}
                    <div className="space-y-2">
                      <h2 className="text-3xl font-semibold text-white tracking-tight"
                        style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                        Set your password
                      </h2>
                      <p className="text-white/45 text-sm">
                        You&apos;re using a temporary password. Set a new one now, or skip and keep the default for now.
                      </p>
                      {invitationData?.email && (
                        <div className="flex items-center gap-2 pt-1">
                          <div className="w-2 h-2 rounded-full bg-violet-400" />
                          <p className="text-white/45 text-sm truncate max-w-[280px]">{invitationData.email}</p>
                        </div>
                      )}
                    </div>

                    <form onSubmit={submitInvitation} className="space-y-3">
                      {/* Current password */}
                      <div className="gi-wrap w-full">
                        <div className="gi">
                          <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                            <Lock className="w-4 h-4 text-white/40" />
                          </div>
                          <input
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="Enter your default password"
                            value={inviteCurrentPassword}
                            onChange={(e) => setInviteCurrentPassword(e.target.value)}
                            autoComplete="current-password"
                            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                          />
                        </div>
                      </div>

                      {/* New password */}
                      <div className="gi-wrap w-full">
                        <div className="gi">
                          <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                            <button type="button" onClick={() => setInviteShowPassword((v) => !v)} className="text-white/40 hover:text-white/70 transition-colors p-1">
                              {inviteShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <input
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special"
                            value={inviteNewPassword}
                            onChange={(e) => setInviteNewPassword(e.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            maxLength={200}
                            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                          />
                        </div>
                      </div>

                      {/* Confirm new password */}
                      <div className="gi-wrap w-full">
                        <div className="gi">
                          <div className="w-10 pl-3 flex-shrink-0 flex items-center justify-center">
                            <Lock className="w-4 h-4 text-white/40" />
                          </div>
                          <input
                            type={inviteShowPassword ? "text" : "password"}
                            placeholder="Re-enter password"
                            value={inviteConfirmPassword}
                            onChange={(e) => setInviteConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            maxLength={200}
                            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none py-3 pr-2"
                          />
                        </div>
                      </div>

                      {inviteConfirmPassword.length > 0 && inviteNewPassword !== inviteConfirmPassword && (
                        <p className="text-xs text-red-300/90 px-1">Passwords don&apos;t match.</p>
                      )}
                      {inviteFormError && (
                        <p className="text-xs text-red-300/90 px-1">{inviteFormError}</p>
                      )}

                      <button type="submit" disabled={inviteSubmitting}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0">
                        {inviteSubmitting ? "Saving…" : "Save & Continue"}
                      </button>
                      <button type="button" onClick={skipInvitation} disabled={inviteSubmitting}
                        className="w-full py-3.5 rounded-2xl bg-white/[0.04] border border-white/15 text-white/85 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed text-sm font-semibold transition-colors">
                        Skip for now
                      </button>
                    </form>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
