"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Field } from "@quikit/ui";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  LineChart,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { AUTH_POST_LOGIN_PATH } from "@/lib/auth/routes";

/* ---------------------------------------------------------------------------
 * Presentational helpers — purely visual, no auth logic lives here.
 * Colors use the app's `crm-*` brand + `accent-*` tokens so the login surface
 * matches the rest of QuikCRM (and stays org-themeable via accent CSS vars).
 * Motion is pure CSS (see `qc-*` classes in globals.css) — no JS animation dep.
 * ------------------------------------------------------------------------- */

const HIGHLIGHTS = [
  {
    icon: LineChart,
    title: "Real-time pipeline analytics",
    desc: "Forecast revenue and surface at-risk deals at a glance.",
  },
  {
    icon: Users,
    title: "One unified customer view",
    desc: "Leads, accounts, contacts and every activity on one timeline.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise-grade security",
    desc: "Tenant isolation and role-based access, on by default.",
  },
];

/** Branding / marketing panel — desktop only (hidden on mobile). */
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-crm-brand qc-gradient-animated lg:flex lg:w-[46%] lg:flex-col lg:justify-between">
      {/* drifting brand glows */}
      <div
        aria-hidden
        className="qc-float pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/15 blur-3xl"
      />
      <div
        aria-hidden
        className="qc-float-slow pointer-events-none absolute -bottom-28 -right-16 h-96 w-96 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="qc-float pointer-events-none absolute right-10 top-1/3 h-64 w-64 rounded-full bg-accent-400/25 blur-3xl"
        style={{ animationDelay: "-6s" }}
      />
      {/* subtle dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* logo */}
      <div className="qc-fade-up relative z-10 p-12">
        <div className="flex items-center gap-2.5 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">QuikCRM</span>
        </div>
      </div>

      {/* headline + highlights */}
      <div className="relative z-10 px-12">
        <h2
          className="qc-fade-up max-w-md text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl"
          style={{ animationDelay: "0.1s" }}
        >
          Run your entire sales pipeline in one place.
        </h2>
        <p
          className="qc-fade-up mt-4 max-w-md text-sm leading-relaxed text-blue-100"
          style={{ animationDelay: "0.18s" }}
        >
          The command center your team uses to capture leads, move deals
          forward and close revenue — faster.
        </p>

        <ul className="mt-10 space-y-5">
          {HIGHLIGHTS.map(({ icon: Icon, title, desc }, i) => (
            <li
              key={title}
              className="qc-fade-up group flex items-start gap-3.5"
              style={{ animationDelay: `${0.3 + i * 0.12}s` }}
            >
              <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110">
                <Icon className="h-4 w-4 text-white" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs leading-relaxed text-blue-100/90">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* footer */}
      <div
        className="qc-fade-in relative z-10 p-12"
        style={{ animationDelay: "0.7s" }}
      >
        <p className="text-xs text-blue-100/80">
          © 2026 QuikCRM. All rights reserved.
        </p>
      </div>
    </aside>
  );
}

/** Centered branded spinner used for the loading + Suspense states. */
function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-crm-login-gradient">
      <div className="flex items-center gap-3 text-crm-muted">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-crm-border border-t-crm-blue" />
        <span className="text-sm">Loading sign-in…</span>
      </div>
    </div>
  );
}

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // UI-only: toggles the password field between masked/visible. Does not
  // affect the submitted value or the auth flow.
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!session?.user?.orgId) return;
    // After a forced sign-out, wait until the client session clears before redirecting.
    if (reason === "session_expired") return;
    router.replace(AUTH_POST_LOGIN_PATH);
  }, [status, session?.user?.orgId, reason, router]);

  const onCredentialsSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFormError(null);
      setSubmitting(true);
      try {
        const res = await signIn("credentials", {
          email,
          password,
          callbackUrl: AUTH_POST_LOGIN_PATH,
          redirect: false,
        });
        if (res?.error) {
          setFormError(
            res.error === "CredentialsSignin" ? "Invalid email or password." : res.error,
          );
          setSubmitting(false);
          return;
        }
        if (res?.ok) {
          router.replace(AUTH_POST_LOGIN_PATH);
          router.refresh();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Sign-in failed.";
        setFormError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [email, password, router],
  );

  const reasonText =
    reason === "session_expired"
      ? "Your session expired. Please sign in again."
      : reason === "unauthorized"
        ? "You are not allowed to access this app with the current account."
        : null;

  if (status === "loading") {
    return <LoadingScreen />;
  }

  return (
    <div className="flex min-h-screen bg-crm-login-gradient qc-gradient-animated">
      <BrandPanel />

      {/* Form column */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          {/* Mobile logo (brand panel is hidden < lg) */}
          <div className="qc-fade-up mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-crm-brand text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-crm-text">
              QuikCRM
            </span>
          </div>

          <div
            className="qc-fade-up rounded-2xl border border-crm-border/80 bg-white/90 p-8 shadow-crm-card backdrop-blur-sm sm:p-10"
            style={{ animationDelay: "0.1s" }}
          >
            <header
              className="qc-fade-up mb-7"
              style={{ animationDelay: "0.18s" }}
            >
              <h1 className="text-2xl font-bold tracking-tight text-crm-text">
                Welcome back
              </h1>
              <p className="mt-1.5 text-sm text-crm-muted">
                Sign in to your QuikCRM workspace to continue.
              </p>
            </header>

            {reasonText ? (
              <div className="qc-fade-in mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <span>{reasonText}</span>
              </div>
            ) : null}

            {formError ? (
              <div
                role="alert"
                className="qc-fade-in mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                <span>{formError}</span>
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={onCredentialsSubmit}>
              <div className="qc-fade-up" style={{ animationDelay: "0.26s" }}>
                <Field label="Email" required>
                  <div className="group relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted transition-colors group-focus-within:text-crm-blue" />
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 rounded-xl pl-10 transition-shadow focus:shadow-sm"
                    />
                  </div>
                </Field>
              </div>

              <div className="qc-fade-up" style={{ animationDelay: "0.34s" }}>
                <Field label="Password" required>
                  <div className="group relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted transition-colors group-focus-within:text-crm-blue" />
                    <Input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-11 rounded-xl pl-10 pr-10 transition-shadow focus:shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      tabIndex={-1}
                      className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-crm-muted transition-colors hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Field>
              </div>

              <div className="qc-fade-up" style={{ animationDelay: "0.42s" }}>
                <Button
                  type="submit"
                  size="lg"
                  loading={submitting}
                  disabled={submitting}
                  /* Brand the shared CTA with accent-* per CLAUDE.md (rule #2),
                     plus a subtle hover lift + glow. `group` drives the arrow nudge. */
                  className="group w-full bg-accent-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-700 hover:shadow-lg hover:shadow-accent-600/30 focus-visible:ring-accent-600 active:translate-y-0"
                >
                  {submitting ? "Signing in…" : "Sign in"}
                  {!submitting && (
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  )}
                </Button>
              </div>
            </form>

            <p
              className="qc-fade-up mt-6 text-center text-xs text-crm-muted"
              style={{ animationDelay: "0.5s" }}
            >
              Need access? Contact your workspace administrator.
            </p>
          </div>

          <p
            className="qc-fade-in mt-6 text-center text-xs text-crm-muted/80"
            style={{ animationDelay: "0.6s" }}
          >
            Protected by QuikCRM • Use your organization account
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginContent />
    </Suspense>
  );
}
