import { useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Logo } from "../../components/Logo";
import "./Login.css";

function safeNext(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const nextUrl = safeNext(new URLSearchParams(location.search).get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={nextUrl} replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/sign-in", { email, password });
      await refresh();
      navigate(nextUrl, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Invalid email or password.");
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit}>
        <div className="brand">
          <Logo size={30} />
          <span>Invoice Brecx</span>
        </div>
        <h1>Welcome back</h1>
        <div className="sub">Sign in to your invoicing workspace.</div>

        {error && <div className="err">{error}</div>}

        <div className="group">
          <label htmlFor="email">Email</label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>

        <div className="group">
          <label htmlFor="password">Password</label>
          <div className="password-wrap">
            <input
              className="input"
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="eye-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

/**
 * Split auth shell — a dark, atmospheric brand panel beside the sign-in
 * form. The left panel is decorative; on narrow screens it collapses and
 * the form's own mobile brand row takes over.
 */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="login-shell">
      <aside className="login-aside" aria-hidden="true">
        <div className="aside-glow" />
        <div className="aside-grid" />
        <div className="aside-noise" />
        <span className="abox abox-1" />
        <span className="abox abox-2" />
        <span className="abox abox-3" />

        <div className="aside-brand">
          <Logo size={38} />
          <span>Invoice Brecx</span>
        </div>

        <div className="aside-inner">
          <div className="aside-eyebrow">Invoicing workspace</div>
          <h2 className="aside-headline">
            From draft to <em>paid, without the chase.</em>
          </h2>
          <p className="aside-sub">
            Create invoices, track what's outstanding, and keep every client
            and payment in one place.
          </p>
          <ul className="aside-features">
            <li>
              <CheckIcon />
              Clients &amp; invoice line items
            </li>
            <li>
              <CheckIcon />
              Draft → sent → paid tracking
            </li>
            <li>
              <CheckIcon />
              Outstanding &amp; overdue at a glance
            </li>
          </ul>
        </div>

        <div className="aside-foot">Brecx · Invoice Brecx</div>
      </aside>

      <main className="login-main">
        <div className="login-card">{children}</div>
      </main>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
