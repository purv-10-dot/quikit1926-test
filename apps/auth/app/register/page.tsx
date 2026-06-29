"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowLeft, Check } from "lucide-react";

/**
 * Self-serve workspace registration — two-panel layout mirroring the central
 * login (left brand panel + right form). Three internal steps:
 *   1. workspace : full name + email + org name  → POST /api/auth/register
 *   2. otp       : 6-digit code (5-min expiry)   → POST /api/auth/verify-otp
 *   3. password  : set + confirm password        → POST /api/auth/register/complete
 * On success we auto sign-in (credentials) and land on the launcher /apps.
 */

const OTP_LENGTH = 6;
const OTP_WINDOW_SECONDS = 300; // 5 minutes

const LAUNCHER_URL = (
  process.env.NEXT_PUBLIC_LAUNCHER_URL ??
  process.env.NEXT_PUBLIC_QUIKIT_URL ??
  "http://localhost:3001"
).replace(/\/+$/, "");

type Step = "workspace" | "otp" | "password";

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("workspace");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [secondsLeft, setSecondsLeft] = useState(OTP_WINDOW_SECONDS);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const expired = secondsLeft <= 0;
  const otpValue = useMemo(() => otp.join(""), [otp]);

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  function resetOtpState() {
    setOtp(Array(OTP_LENGTH).fill(""));
    setSecondsLeft(OTP_WINDOW_SECONDS);
    setResetToken(null);
  }

  async function handleCreateWorkspace(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName, email, organizationName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Could not start registration.");
        return;
      }
      resetOtpState();
      setStep("otp");
      setInfo(`We sent a 6-digit code to ${email}.`);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function setOtpDigit(idx: number, val: string) {
    const digit = val.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    setOtp(next);
    otpRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (otpValue.length !== OTP_LENGTH) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (expired) {
      setError("This code has expired. Please resend a new one.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp: otpValue }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        setError(body.error || "Invalid or expired code.");
        setOtp(Array(OTP_LENGTH).fill(""));
        otpRefs.current[0]?.focus();
        return;
      }
      setResetToken(body.resetToken);
      setStep("password");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      await fetch("/api/auth/register/resend-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      resetOtpState();
      setInfo(`A new code was sent to ${email}.`);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {
      setError("Could not resend the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!resetToken) {
      setError("Your verification expired. Please start again.");
      setStep("workspace");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetToken, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        setError(body.error || "Could not finish setting up your workspace.");
        if (res.status === 400) setStep("workspace");
        return;
      }
      await signIn("credentials", { email, password, callbackUrl: `${LAUNCHER_URL}/apps` });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    setError(null);
    setInfo(null);
    if (step === "password") setStep("otp");
    else if (step === "otp") setStep("workspace");
    else window.location.href = "/login";
  }

  const heading =
    step === "workspace"
      ? "Create your workspace"
      : step === "otp"
        ? "Verify your email"
        : "Set your password";
  const sub =
    step === "workspace"
      ? "This is the home for your organization across every QuikIT app."
      : step === "otp"
        ? `Enter the 6-digit code we sent to ${email || "your email"}.`
        : "Choose a password to finish setting up your account.";

  return (
    <div className="qk-reg">
      <style dangerouslySetInnerHTML={{ __html: REG_CSS }} />
      <div className="auth-layout">
        {/* ── Left brand panel ── */}
        <aside className="auth-side">
          <button type="button" className="auth-back" onClick={handleBack} aria-label="Go back">
            <ArrowLeft />
          </button>
          <div className="auth-side-content">
            <span className="auth-side-badge">GET STARTED FREE</span>
            <h2 className="auth-side-title">
              Set up your <em>workspace.</em>
            </h2>
            <ul className="auth-side-list">
              <li><Check className="chk" /> Free for up to 5 users</li>
              <li><Check className="chk" /> No credit card required</li>
              <li><Check className="chk" /> Every app shares one data layer</li>
            </ul>
          </div>
        </aside>

        {/* ── Right form panel ── */}
        <main className="auth-main">
          <div className="auth-main-top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/auth/quikit-logo-dark.png" alt="QuikIT" width={120} height={32} className="auth-logo-img" />
            <a href="/login" className="auth-top-link">Sign in</a>
          </div>

          <div className="auth-card">
            <h1>{heading}</h1>
            <p className="auth-sub">{sub}</p>

            {error && <div className="auth-banner">{error}</div>}
            {info && !error && <div className="auth-info">{info}</div>}

            {/* STEP 1 */}
            {step === "workspace" && (
              <form onSubmit={handleCreateWorkspace} noValidate>
                <div className="auth-field">
                  <label htmlFor="reg-name">Full name</label>
                  <input id="reg-name" type="text" autoComplete="name" placeholder="Jane Cooper"
                    value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-email">Email</label>
                  <input id="reg-email" type="email" autoComplete="email" placeholder="you@company.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-org">Organization name</label>
                  <input id="reg-org" type="text" autoComplete="organization" placeholder="Acme Inc."
                    value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required minLength={2} />
                </div>
                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? "Sending code…" : "Continue →"}
                </button>
              </form>
            )}

            {/* STEP 2 */}
            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} noValidate>
                <div className="fp-otp" onPaste={handleOtpPaste}>
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      className={`fp-otp-input${d ? " filled" : ""}`}
                      value={d}
                      onChange={(e) => setOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      inputMode="numeric"
                      maxLength={1}
                      disabled={expired}
                    />
                  ))}
                </div>
                <div className="fp-resend">
                  {expired ? (
                    <span style={{ color: "#B91C1C" }}>Your code has expired.</span>
                  ) : (
                    <>Code expires in <strong>{mmss(secondsLeft)}</strong></>
                  )}
                </div>
                <button type="submit" className="auth-submit"
                  disabled={submitting || expired || otpValue.length !== OTP_LENGTH}>
                  {submitting ? "Verifying…" : "Continue →"}
                </button>
                <div className="fp-resend">
                  Didn&apos;t get it?{" "}
                  <button type="button" className="fp-resend-btn" onClick={handleResend} disabled={submitting}>
                    Resend code
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3 */}
            {step === "password" && (
              <form onSubmit={handleSetPassword} noValidate>
                <div className="auth-field">
                  <label htmlFor="reg-pass">New password</label>
                  <input id="reg-pass" type="password" autoComplete="new-password" placeholder="minimum 8 characters"
                    value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                </div>
                <div className="auth-field">
                  <label htmlFor="reg-confirm">Confirm password</label>
                  <input id="reg-confirm" type="password" autoComplete="new-password" placeholder="re-enter password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
                </div>
                <button type="submit" className="auth-submit" disabled={submitting}>
                  {submitting ? "Setting up your workspace…" : "Continue →"}
                </button>
              </form>
            )}

            {step === "workspace" && (
              <p className="auth-signup-link" style={{ textAlign: "center", marginTop: 20 }}>
                Already have an account? <a href="/login">Sign in</a>
              </p>
            )}
          </div>

          <div className="auth-foot">
            <span>© 2026 QuikIT</span>
            <a href="/login">Need help?</a>
          </div>
        </main>
      </div>
    </div>
  );
}

const REG_CSS = `
.qk-reg, .qk-reg *, .qk-reg *::before, .qk-reg *::after { box-sizing:border-box; }
.qk-reg { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#fff; color:#111; -webkit-font-smoothing:antialiased; height:100vh; padding:24px; display:flex; overflow:hidden; }
.qk-reg a { text-decoration:none; color:inherit; }
.qk-reg img { display:block; max-width:100%; }
.qk-reg .auth-layout { flex:1; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,calc(42% - 12px)); gap:24px; height:100%; }
.qk-reg .auth-side { position:relative; background:url('/auth/login-bg.webp') center/cover no-repeat; color:#fff; padding:48px; display:flex; flex-direction:column; justify-content:flex-end; overflow:hidden; border-radius:24px; }
.qk-reg .auth-back { position:absolute; top:24px; left:24px; z-index:2; width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(255,255,255,0.18); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); color:#fff; border:1px solid rgba(255,255,255,0.22); cursor:pointer; transition:background .15s, transform .1s; }
.qk-reg .auth-back:hover { background:rgba(255,255,255,0.28); }
.qk-reg .auth-back:active { transform:scale(0.94); }
.qk-reg .auth-back svg { width:18px; height:18px; }
.qk-reg .auth-side-content { position:relative; z-index:1; }
.qk-reg .auth-side-badge { display:inline-block; font-size:11px; font-weight:700; letter-spacing:0.08em; padding:6px 14px; border-radius:999px; border:1px solid rgba(255,255,255,0.5); background:rgba(255,255,255,0.08); margin-bottom:18px; }
.qk-reg .auth-side-title { font-family:'DM Serif Display',Georgia,serif; font-size:40px; line-height:1.05; font-weight:400; margin-bottom:24px; }
.qk-reg .auth-side-title em { font-style:italic; }
.qk-reg .auth-side-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px; }
.qk-reg .auth-side-list li { display:flex; align-items:center; gap:10px; font-size:15px; color:rgba(255,255,255,0.92); }
.qk-reg .auth-side-list .chk { width:16px; height:16px; color:#CDB18B; flex-shrink:0; }
.qk-reg .auth-main { display:flex; flex-direction:column; padding:24px 48px; height:100%; background:#fff; overflow:auto; border-radius:24px; }
.qk-reg .auth-main-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-shrink:0; }
.qk-reg .auth-logo-img { height:32px; width:auto; }
.qk-reg .auth-top-link { font-size:13px; font-weight:600; color:#0D1117; text-decoration:underline; text-underline-offset:3px; }
.qk-reg .auth-top-link:hover { color:#9A6217; }
.qk-reg .auth-card { width:100%; max-width:420px; margin:auto; }
.qk-reg .auth-card h1 { font-size:28px; font-weight:800; letter-spacing:-0.02em; text-align:center; margin-bottom:8px; color:#0D1117; }
.qk-reg .auth-card .auth-sub { font-size:14px; color:#6B7280; text-align:center; margin-bottom:28px; line-height:1.6; }
.qk-reg .auth-field { margin-bottom:16px; }
.qk-reg .auth-field label { display:block; font-size:13px; font-weight:600; color:#0D1117; margin-bottom:6px; }
.qk-reg .auth-field input { width:100%; padding:12px 14px; font-family:inherit; font-size:14px; color:#0D1117; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; transition:border-color .15s, box-shadow .15s; outline:none; }
.qk-reg .auth-field input::placeholder { color:#9CA3AF; }
.qk-reg .auth-field input:focus { border-color:#CDB18B; box-shadow:0 0 0 3px rgba(205,177,139,0.18); }
.qk-reg .auth-submit { width:100%; padding:14px 18px; margin-top:8px; background:#9A6217; border:none; border-radius:10px; font-family:inherit; font-size:14px; font-weight:700; color:#fff; cursor:pointer; transition:background .15s, transform .1s; }
.qk-reg .auth-submit:hover:not(:disabled) { background:#80500f; }
.qk-reg .auth-submit:active:not(:disabled) { transform:scale(0.99); }
.qk-reg .auth-submit:disabled { opacity:.6; cursor:not-allowed; }
.qk-reg .auth-banner { padding:10px 12px; border-radius:10px; background:#FEF2F2; border:1px solid #FECACA; color:#991B1B; font-size:13px; margin-bottom:16px; }
.qk-reg .auth-info { padding:10px 12px; border-radius:10px; background:#EEF2FF; border:1px solid #C7D2FE; color:#3730A3; font-size:13px; margin-bottom:16px; }
.qk-reg .auth-signup-link { font-size:13px; color:#6B7280; }
.qk-reg .auth-signup-link a { color:#0D1117; font-weight:600; text-decoration:underline; text-underline-offset:3px; }
.qk-reg .auth-signup-link a:hover { color:#9A6217; }
.qk-reg .auth-foot { display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:24px; font-size:12px; color:#9CA3AF; border-top:1px solid rgba(0,0,0,0.05); flex-shrink:0; }
.qk-reg .auth-foot a:hover { color:#0D1117; }
.qk-reg .fp-otp { display:grid; grid-template-columns:repeat(6, 1fr); gap:10px; margin-bottom:8px; }
.qk-reg .fp-otp-input { width:100%; aspect-ratio:1 / 1.15; text-align:center; font-family:inherit; font-size:22px; font-weight:700; color:#0D1117; background:#fff; border:1px solid rgba(0,0,0,0.12); border-radius:10px; transition:border-color .15s, box-shadow .15s; outline:none; }
.qk-reg .fp-otp-input:focus { border-color:#CDB18B; box-shadow:0 0 0 3px rgba(205,177,139,0.18); }
.qk-reg .fp-otp-input.filled { border-color:#0D1117; background:#F7F7F4; }
.qk-reg .fp-otp-input:disabled { background:#F3F4F6; color:#9CA3AF; }
.qk-reg .fp-resend { text-align:center; font-size:13px; color:#6B7280; margin-top:14px; }
.qk-reg .fp-resend-btn { background:none; border:none; padding:0; font:inherit; color:#0D1117; font-weight:600; cursor:pointer; text-decoration:underline; text-underline-offset:3px; }
.qk-reg .fp-resend-btn:disabled { color:#9CA3AF; cursor:not-allowed; text-decoration:none; }
.qk-reg .fp-resend-btn:not(:disabled):hover { color:#9A6217; }
@media (max-width:900px) {
  .qk-reg { height:auto; min-height:100vh; padding:16px; overflow:visible; }
  .qk-reg .auth-layout { grid-template-columns:1fr; height:auto; min-height:calc(100vh - 32px); }
  .qk-reg .auth-side { padding:28px 24px 40px; min-height:220px; }
  .qk-reg .auth-side-title { font-size:32px; }
  .qk-reg .auth-main { padding:24px 20px 32px; height:auto; overflow:visible; }
}
@media (max-width:480px) {
  .qk-reg { padding:12px; }
  .qk-reg .auth-side, .qk-reg .auth-main { border-radius:18px; }
  .qk-reg .auth-card h1 { font-size:24px; }
}
`;
