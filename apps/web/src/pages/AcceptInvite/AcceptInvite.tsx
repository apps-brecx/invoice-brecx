import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import "./AcceptInvite.css";

interface InviteInfo {
  email: string;
  name: string | null;
  role: string;
  invitedBy: string | null;
  orgName: string;
  expiresAt: string;
  expired: boolean;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/* The invite link from the email lands here: a ledger "membership
 * certificate" — the invite details ruled like ledger lines, the form
 * below, and a MEMBER stamp that slams on success. Public page. */
export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [inv, setInv] = useState<InviteInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "joining" | "joined">("idle");

  useEffect(() => {
    api
      .get<{ invitation: InviteInfo }>(`/invitations/${token}`)
      .then((r) => {
        setInv(r.invitation);
        setName(r.invitation.name ?? "");
      })
      .catch((e) =>
        setLoadErr(e instanceof ApiError ? e.message : "This invite link is no longer valid."),
      );
  }, [token]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr("Password needs at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("The two passwords don't match.");
      return;
    }
    setPhase("joining");
    try {
      await api.post(`/invitations/${token}/accept`, { name: name.trim(), password });
      setPhase("joined");
      // Let the MEMBER stamp land, then walk into the workspace signed in.
      setTimeout(async () => {
        await refresh();
        navigate("/dashboard", { replace: true });
      }, 900);
    } catch (e2) {
      setPhase("idle");
      setErr(e2 instanceof ApiError ? e2.message : "Couldn't accept the invite. Try again.");
    }
  }

  const busy = phase !== "idle";
  const dead = loadErr !== null || (inv?.expired ?? false);

  return (
    <div className="inv-wrap">
      <span className="inv-watermark" aria-hidden>Nº</span>

      <main className="inv-cert" data-state={dead ? "dead" : phase}>
        <span className={"inv-stamp" + (phase === "joined" ? " on" : dead ? " bad on" : "")}>
          {dead ? (inv?.expired ? "Expired" : "Invalid") : "Member"}
        </span>

        <header className="inv-brand">
          <span className="inv-mark">B</span>
          <span>
            <b>Brecx Billing</b>
            <small>{inv?.orgName ?? "Fresh Finest LLC"}</small>
          </span>
          <span className="inv-serial">Nº INVITE</span>
        </header>

        {/* ---------- invalid / expired ---------- */}
        {dead && (
          <div className="inv-dead">
            <div className="inv-eyebrow">Workspace invitation</div>
            <h1>{inv?.expired ? "This invite has expired" : "This invite isn't valid anymore"}</h1>
            <p>
              {loadErr ??
                "Invites stay open for 7 days. Ask your workspace admin to send you a fresh one — it only takes a moment."}
            </p>
            <button type="button" className="btn btn-primary inv-cta" onClick={() => navigate("/login")}>
              Go to sign in
            </button>
          </div>
        )}

        {/* ---------- loading ---------- */}
        {!dead && !inv && (
          <div className="inv-loading">
            <div className="spinner" />
            <span>Checking your invite…</span>
          </div>
        )}

        {/* ---------- the certificate ---------- */}
        {!dead && inv && (
          <>
            <div className="inv-lede">
              <div className="inv-eyebrow">Workspace invitation</div>
              <h1>
                Join {inv.orgName}'s
                <br />
                billing workspace
              </h1>
              <p>
                <b>{inv.invitedBy ?? "Your admin"}</b> reserved a seat for you. Confirm your details
                below and you're in.
              </p>
            </div>

            <dl className="inv-ledger">
              <div>
                <dt>Signing in as</dt>
                <dd className="mono">{inv.email}</dd>
              </div>
              <div>
                <dt>Your role</dt>
                <dd>
                  <span className="inv-role">{inv.role === "admin" ? "Admin" : "User"}</span>
                </dd>
              </div>
              <div>
                <dt>Invite valid till</dt>
                <dd>{fmtDate(inv.expiresAt)}</dd>
              </div>
            </dl>

            <form onSubmit={onSubmit} noValidate>
              <div className="inv-field">
                <label htmlFor="inv-name">Your name</label>
                <input
                  id="inv-name"
                  required
                  maxLength={120}
                  placeholder="How your team will see you"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus={!inv.name}
                />
              </div>

              <div className="inv-2col">
                <div className="inv-field">
                  <label htmlFor="inv-pass">Create password</label>
                  <div className="inv-passwrap">
                    <input
                      id="inv-pass"
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      placeholder="Min 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="button" className="inv-peek" onClick={() => setShow((v) => !v)}>
                      {show ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                </div>
                <div className="inv-field">
                  <label htmlFor="inv-confirm">Confirm password</label>
                  <input
                    id="inv-confirm"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    placeholder="Once more"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>

              {err && <div className="inv-err">{err}</div>}

              <button type="submit" className="btn btn-primary inv-cta" disabled={busy}>
                {phase === "joining" && <span className="spin" aria-hidden />}
                {phase === "joining"
                  ? "Setting up your seat…"
                  : phase === "joined"
                    ? "Welcome aboard — opening workspace…"
                    : "Accept & join workspace"}
              </button>

              <p className="inv-fineprint">
                By joining you agree to keep this workspace's data confidential.
              </p>
            </form>
          </>
        )}
      </main>

      <div className="inv-foot">© 2026 Brecx · Fresh Finest LLC</div>
    </div>
  );
}
