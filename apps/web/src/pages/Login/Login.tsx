import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/Toast";
import "./Login.css";

function safeNext(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

const reduceMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const nextUrl = safeNext(new URLSearchParams(location.search).get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "checking" | "opening">("idle");
  const [stamp, setStamp] = useState<"signin" | "ok" | "bad">("signin");

  if (user) return <Navigate to={nextUrl} replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let ok = true;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailErr("Enter a valid email address.");
      ok = false;
    }
    if (!password) {
      setPassErr("Password is required.");
      ok = false;
    }
    if (!ok) return;

    setPhase("checking");
    setStamp("signin");
    try {
      await api.post("/auth/sign-in", { email, password });
      setStamp("ok");
      setPhase("opening");
      toast(`Welcome back${email ? ", " + email.split("@")[0] : ""}`);
      // Let the "Verified" stamp land before the workspace opens.
      setTimeout(async () => {
        await refresh();
        navigate(nextUrl, { replace: true });
      }, 700);
    } catch (err) {
      setPhase("idle");
      setStamp("bad");
      const msg =
        err instanceof ApiError
          ? err.message || "Invalid email or password."
          : "Sign-in failed. Please try again.";
      setPassErr(msg);
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="login-wrap">
      {/* LEFT — brand panel */}
      <aside className="pane">
        <span className="watermark" aria-hidden="true">
          Nº
        </span>
        <span className="ring2" aria-hidden="true" />
        <span className="grain" aria-hidden="true" />
        <div className="pane-brand">
          <div className="pane-mark">B</div>
          <div>
            <b>Brecx Billing</b>
            <span>Fresh Finest LLC</span>
          </div>
        </div>

        <div className="pane-mid">
          <div className="eyebrow">Nº 001 — The Ledger, Digitised</div>
          <h1>
            Every invoice out.
            <br />
            Every dollar{" "}
            <em>
              tracked in.
              <svg viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true">
                <path
                  d="M2 6 C 25 1, 55 7, 118 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </em>
          </h1>
          <p>
            One ledger for Syruvia wholesale, retail accounts, and marketplace orders — issued,
            reminded, reconciled.
          </p>

          <MiniLedger />
        </div>

        <div className="pane-foot">
          <div>
            <b>
              <CountUp target={91.3} prefix="$" suffix="k" />
            </b>
            collected this quarter <i className="up">▲ 12.4%</i>
          </div>
          <div>
            <b>
              <CountUp target={18.2} />
            </b>
            avg. days to pay <i className="up">▼ 2.1d</i>
          </div>
          <div>
            <b>
              <CountUp target={83.7} suffix="%" />
            </b>
            collection rate <i className="up">▲ 1.9%</i>
          </div>
          <svg className="spark" width="86" height="30" viewBox="0 0 86 30" aria-hidden="true">
            <path
              d="M2 24 L14 20 L26 22 L38 14 L50 16 L62 9 L74 11 L84 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="84" cy="4" r="2.6" fill="currentColor" />
          </svg>
        </div>
      </aside>

      {/* RIGHT — sign-in paper */}
      <main className="stage">
        <div className="paper">
          <span className={"stamp" + (stamp === "ok" ? " ok" : stamp === "bad" ? " bad" : "")}>
            {stamp === "ok" ? "Verified" : stamp === "bad" ? "Denied" : "Sign in"}
          </span>
          <div className="paper-top">
            <div>
              <h2>Welcome back</h2>
              <p>Sign in to your billing workspace.</p>
            </div>
            <span className="serial">Nº LOGIN</span>
          </div>

          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <label className="f-lab" htmlFor="email">
                Work email
              </label>
              <div className="in-wrap">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@brecx.com"
                  required
                  className={emailErr ? "err" : ""}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailErr(null);
                  }}
                  autoFocus
                />
              </div>
              {emailErr && <div className="hint">{emailErr}</div>}
            </div>

            <div className="field">
              <label className="f-lab" htmlFor="pass">
                Password
              </label>
              <div className="in-wrap">
                <input
                  id="pass"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  required
                  className={passErr ? "err" : ""}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPassErr(null);
                    if (stamp === "bad") setStamp("signin");
                  }}
                />
                <button
                  type="button"
                  className="peek"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
              {passErr && <div className="hint">{passErr}</div>}
            </div>

            <div className="row-between">
              <label className="remember">
                <input type="checkbox" defaultChecked /> Keep me signed in
              </label>
              <button
                type="button"
                className="forgot"
                onClick={() => toast("Ask an admin to reset your password", "info")}
              >
                Forgot password?
              </button>
            </div>

            <button className="btn btn-primary" type="submit" disabled={busy}>
              {phase === "checking" && <span className="spin" aria-hidden="true" />}
              <span>
                {phase === "checking"
                  ? "Checking credentials…"
                  : phase === "opening"
                    ? "Opening workspace…"
                    : "Sign in to workspace"}
              </span>
            </button>

            <div className="paper-foot">
              New to the team?{" "}
              <button type="button" onClick={() => toast("Ask an admin for an invite", "info")}>
                Ask an admin for an invite
              </button>
            </div>
          </form>
        </div>

        <div className="under-note">© 2026 Brecx · Fresh Finest LLC · Privacy · Status</div>
      </main>
    </div>
  );
}

/* Count-up number for the pane footer stats. */
function CountUp({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(reduceMotion() ? target : 0);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || reduceMotion()) return;
    ran.current = true;
    const t0 = performance.now();
    const dur = 1100;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      setVal(target * ease);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <>
      {prefix}
      {val.toFixed(1)}
      {suffix}
    </>
  );
}

/* The decorative "Today's ledger" strip: rows fade in, then Sable Roasters'
 * payment lands — the stamp slams from Due to Paid and the total counts up. */
function MiniLedger() {
  const [slammed, setSlammed] = useState(false);
  const [total, setTotal] = useState(1215.5);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSlammed(true);
      const from = 1215.5;
      const to = 13695.5;
      if (reduceMotion()) {
        setTotal(to);
        return;
      }
      const t0 = performance.now();
      const dur = 900;
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        setTotal(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 1700);
    return () => clearTimeout(timer);
  }, []);

  const fmt = (n: number) =>
    "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="ledger-stack" aria-hidden="true">
      <div className="mini-ledger">
        <div className="ml-head">
          Today's ledger
          <span className="live">
            <i />
            Live
          </span>
        </div>
        <div className="ml-row">
          <span className="ml-id">INV-2606</span>
          <span className="ml-name">Café Botanica</span>
          <span className="ml-stamp paid">Paid</span>
          <span className="ml-amt">$1,215.50</span>
        </div>
        <div className="ml-row">
          <span className="ml-id">INV-2607</span>
          <span className="ml-name">Grove Grocers</span>
          <span className="ml-stamp due">Due</span>
          <span className="ml-amt">$4,860.00</span>
        </div>
        <div className="ml-row">
          <span className="ml-id">INV-2599</span>
          <span className="ml-name">Sable Roasters</span>
          <span className={"ml-stamp " + (slammed ? "paid slam" : "due")}>
            {slammed ? "Paid" : "Due"}
          </span>
          <span className="ml-amt">$12,480.00</span>
        </div>
        <div className="ml-total">
          <span>Collected today</span>
          <b>{fmt(total)}</b>
        </div>
      </div>
    </div>
  );
}
