import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import {
  fetchSessions,
  revokeSession,
  parseUA,
  timeAgo,
  fmtShortDate,
  type SessionInfo,
} from "../../lib/team";
import { ListSkeleton } from "../../components/TableSkeleton";
import { useToast } from "../../components/Toast";

export function SecurityTab() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchSessions();
      rows.sort((a, b) => Number(b.current) - Number(a.current));
      setSessions(rows);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next.length < 8) {
      toast("New password must be at least 8 characters", "error");
      return;
    }
    if (next !== confirm) {
      toast("New passwords don't match", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/me/password", { current, next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Password updated — every other device was signed out");
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update the password", "error");
    } finally {
      setSaving(false);
    }
  }

  async function onRevoke(sid: string) {
    setRevoking(sid);
    try {
      await revokeSession(sid);
      setSessions((s) => (s ? s.filter((x) => x.sid !== sid) : s));
      toast("Session revoked — that device is signed out");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't revoke the session", "error");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <>
      <form className="card set-card" onSubmit={onSubmit}>
        <div className="sc-head">
          <h2>Change password</h2>
          <span className="sc-sub">Updating your password signs out every other device automatically.</span>
        </div>
        <div className="sc-body">
          <div className="set-field" style={{ maxWidth: 420 }}>
            <label>Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="set-grid2">
            <div className="set-field">
              <label>New password</label>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <div className="set-field">
              <label>Confirm new password</label>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          <div className="sc-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Updating…" : "Update password"}
            </button>
          </div>
        </div>
      </form>

      <div className="card set-card">
        <div className="sc-head">
          <h2>Active sessions</h2>
          <span className="sc-sub">
            Devices currently signed in to your account. Revoke any that you don't recognise.
          </span>
        </div>
        <div className="sess-list">
          {sessions === null && <ListSkeleton rows={2} />}
          {sessions?.length === 0 && (
            <div className="sc-body">
              <div className="empty-note">
                <b>No tracked sessions yet</b>
                Sessions started before this feature shipped aren't listed — they'll appear on the
                next sign-in.
              </div>
            </div>
          )}
          {sessions?.map((s) => (
            <div key={s.sid} className="sess-row">
              <span className={"sess-dot" + (s.current ? " live" : "")} aria-hidden />
              <div className="sess-main">
                <div className="sess-title">
                  {parseUA(s.userAgent)}
                  {s.current && <span className="sess-this">This device</span>}
                </div>
                <div className="sess-meta">
                  {s.ip ? `IP ${s.ip} · ` : ""}
                  Last seen {timeAgo(s.lastSeenAt)} · Expires {fmtShortDate(s.expiresAt)}
                </div>
              </div>
              {!s.current && (
                <button
                  type="button"
                  className="btn btn-ghost sess-revoke"
                  disabled={revoking === s.sid}
                  onClick={() => void onRevoke(s.sid)}
                >
                  {revoking === s.sid ? "Revoking…" : "Revoke"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
