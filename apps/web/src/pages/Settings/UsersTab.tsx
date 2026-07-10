import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDateTime } from "../../lib/store";
import {
  fetchTeam,
  updateMember,
  removeUser,
  fetchInvitations,
  sendInvitation,
  resendInvitation,
  cancelInvitation,
  fmtShortDate,
  type TeamUser,
  type Invitation,
} from "../../lib/team";
import { Select } from "../../components/Select";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Tooltip } from "../../components/Tooltip";
import { ListSkeleton } from "../../components/TableSkeleton";
import { useToast } from "../../components/Toast";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function UsersTab() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  /* ------------------------------ your profile ------------------------------ */
  const [name, setName] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch("/me/profile", { name, ...(password ? { password } : {}) });
      setPassword("");
      await refresh();
      toast("Profile saved");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save your profile", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  /* ----------------------------- team + invites ----------------------------- */
  const [team, setTeam] = useState<TeamUser[] | null>(null);
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [users, invitations] = await Promise.all([fetchTeam(), fetchInvitations()]);
      setTeam(users);
      setInvites(invitations);
    } catch {
      setTeam([]);
      setInvites([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(u: TeamUser, role: string) {
    if (role === u.role) return;
    try {
      await updateMember(u.id, { role });
      setTeam((t) => t?.map((x) => (x.id === u.id ? { ...x, role } : x)) ?? t);
      toast(`${u.name || u.email} is now ${role === "admin" ? "an Admin" : "a User"}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change the role", "error");
    }
  }

  async function saveMember(u: TeamUser, nextName: string, nextRole: string) {
    const isMe = u.id === user?.userId;
    // Editing yourself goes through /me/profile so the session (topbar
    // name) refreshes immediately; the admin endpoint covers everyone else.
    if (isMe) {
      await api.patch("/me/profile", { name: nextName });
      await refresh();
    } else {
      await updateMember(u.id, { name: nextName, role: nextRole });
    }
    setTeam((t) =>
      t?.map((x) => (x.id === u.id ? { ...x, name: nextName, role: isMe ? x.role : nextRole } : x)) ?? t,
    );
    if (u.id === editTarget?.id) setEditTarget(null);
    toast(`${nextName} updated`);
    if (isMe) setName(nextName);
  }

  async function deleteMember(u: TeamUser) {
    setBusyId(`u-${u.id}`);
    try {
      await removeUser(u.id);
      setTeam((t) => t?.filter((x) => x.id !== u.id) ?? t);
      toast(`${u.name || u.email} removed from the workspace`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't remove the member", "error");
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  }

  async function resend(inv: Invitation) {
    setBusyId(`i-${inv.id}`);
    try {
      const res = await resendInvitation(inv.id);
      setInvites((l) => l?.map((x) => (x.id === inv.id ? res.invitation : x)) ?? l);
      toast(res.emailed ? `Invite re-sent to ${inv.email}` : "Invite refreshed — email isn't configured, copy the link instead", res.emailed ? "info" : "error");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't resend the invite", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(inv: Invitation) {
    setBusyId(`i-${inv.id}`);
    try {
      await cancelInvitation(inv.id);
      setInvites((l) => l?.filter((x) => x.id !== inv.id) ?? l);
      toast(`Invite for ${inv.email} cancelled`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't cancel the invite", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink(inv: Invitation) {
    try {
      await navigator.clipboard.writeText(inv.inviteUrl);
      toast("Invite link copied");
    } catch {
      toast("Couldn't copy — the link is in the invite email", "error");
    }
  }

  return (
    <>
      {/* -------- Your profile -------- */}
      <form className="card set-card" onSubmit={saveProfile}>
        <div className="sc-head">
          <h2>Your profile</h2>
          <span className="sc-sub">Update your name or password</span>
        </div>
        <div className="sc-body">
          <div className="set-grid2">
            <div className="set-field">
              <label>Name</label>
              <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="set-field">
              <label>Email</label>
              <input value={user?.email ?? ""} disabled />
            </div>
          </div>
          <div className="set-field">
            <label>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="Leave blank to keep current"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="sc-actions">
            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </div>
        </div>
      </form>

      {isAdmin && (
        <>
          {/* -------- Team members -------- */}
          <div className="card set-card">
            <div className="sc-head">
              <div>
                <h2>Team Members</h2>
                <span className="sc-count">
                  {team ? `${team.length} user${team.length === 1 ? "" : "s"}` : "…"}
                </span>
              </div>
              <button type="button" className="btn btn-primary sc-head-btn" onClick={() => setInviteOpen(true)}>
                + Invite member
              </button>
            </div>
            {team === null ? (
              <ListSkeleton rows={3} />
            ) : (
              <table className="ledger team-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((u) => {
                    const isMe = u.id === user?.userId;
                    return (
                      <tr key={u.id}>
                        <td>
                          <span className="tm-name">
                            <b>{u.name || u.email.split("@")[0]}</b>
                            {isMe && <span className="you-chip">You</span>}
                          </span>
                        </td>
                        <td className="tm-email">{u.email}</td>
                        <td>
                          {isMe ? (
                            <span className="role-chip">{u.role === "admin" ? "Admin" : "User"}</span>
                          ) : (
                            <Select
                              className="form-sel tm-role"
                              value={u.role}
                              options={ROLE_OPTIONS}
                              onChange={(v) => void changeRole(u, v)}
                            />
                          )}
                        </td>
                        <td className="tm-joined">{fmtDateTime(u.created_at)}</td>
                        <td className="right">
                          <div className="tm-actions">
                            <Tooltip label="Edit member">
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label="Edit member"
                                onClick={() => setEditTarget(u)}
                              >
                                <PencilIcon />
                              </button>
                            </Tooltip>
                            {!isMe && (
                              <Tooltip label="Remove from workspace">
                                <button
                                  type="button"
                                  className="icon-btn tm-del"
                                  aria-label="Remove from workspace"
                                  disabled={busyId === `u-${u.id}`}
                                  onClick={() => setDeleteTarget(u)}
                                >
                                  <TrashIcon />
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* -------- Pending invitations -------- */}
          <div className="card set-card">
            <div className="sc-head">
              <div>
                <h2>Pending invitations</h2>
                <span className="sc-count">
                  {invites ? `${invites.length} awaiting acceptance` : "…"}
                </span>
              </div>
            </div>
            <div className="sc-body">
              {invites?.length === 0 && (
                <div className="pi-empty">
                  <span className="pi-empty-ic" aria-hidden>∅</span>
                  <b>No pending invitations</b>
                  <span>Invite a member to add them to this workspace.</span>
                </div>
              )}
              {invites?.map((inv) => (
                <div key={inv.id} className="pi-row">
                  <div className="pi-main">
                    <div className="pi-title">
                      <b>{inv.email}</b>
                      <span className="role-chip">{inv.role === "admin" ? "Admin" : "User"}</span>
                      {inv.expired && <span className="pi-expired">Expired</span>}
                    </div>
                    <div className="pi-meta">
                      {inv.name ? `${inv.name} · ` : ""}
                      Invited {fmtShortDate(inv.createdAt)} by {inv.invitedBy ?? "Admin"} ·{" "}
                      {inv.expired ? "expired" : "expires"} {fmtShortDate(inv.expiresAt)}
                    </div>
                  </div>
                  <div className="pi-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => void copyLink(inv)}>
                      Copy link
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === `i-${inv.id}`}
                      onClick={() => void resend(inv)}
                    >
                      Resend
                    </button>
                    <Tooltip label="Cancel invitation">
                      <button
                        type="button"
                        className="icon-btn tm-del"
                        aria-label="Cancel invitation"
                        disabled={busyId === `i-${inv.id}`}
                        onClick={() => void cancel(inv)}
                      >
                        <TrashIcon />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {editTarget && (
        <EditMemberModal
          member={editTarget}
          isMe={editTarget.id === user?.userId}
          onSave={saveMember}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Remove team member?"
          message={
            <>
              <b>{deleteTarget.name || deleteTarget.email}</b> ({deleteTarget.email}) will lose
              access to this workspace and be signed out of every device. This can't be undone —
              you'd have to invite them again.
            </>
          }
          confirmLabel="Remove member"
          onConfirm={() => void deleteMember(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {inviteOpen && (
        <InviteMemberModal
          onClose={() => setInviteOpen(false)}
          onSent={(inv, emailed) => {
            setInvites((l) => (l ? [inv, ...l] : [inv]));
            setInviteOpen(false);
            toast(
              emailed
                ? `Invitation emailed to ${inv.email}`
                : "Invite created — email isn't configured, use Copy link to share it",
              emailed ? "info" : "error",
            );
          }}
        />
      )}
    </>
  );
}

/* Edit a member's name/role. Editing yourself only changes the name —
 * your own admin role is guarded on the API too. */
function EditMemberModal({
  member,
  isMe,
  onSave,
  onClose,
}: {
  member: TeamUser;
  isMe: boolean;
  onSave: (u: TeamUser, name: string, role: string) => Promise<void>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(member.name ?? "");
  const [role, setRole] = useState(member.role === "admin" ? "admin" : "user");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(member, name.trim(), role);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the member", "error");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal invite-modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} role="dialog">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Edit member</h3>
        <p className="im-sub">{member.email}</p>

        <div className="set-field">
          <label>
            Name <i>*</i>
          </label>
          <input
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="set-field">
          <label>Role</label>
          {isMe ? (
            <>
              <input value={member.role === "admin" ? "Admin" : "User"} disabled />
              <small>You can't change your own role.</small>
            </>
          ) : (
            <Select className="form-sel" value={role} options={ROLE_OPTIONS} onChange={setRole} />
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* Zoho/Priceobo-style small centred modal. */
function InviteMemberModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (inv: Invitation, emailed: boolean) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await sendInvitation({ name: name.trim(), email: email.trim(), role });
      onSent(res.invitation, res.emailed);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't send the invite", "error");
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal invite-modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} role="dialog">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Invite member</h3>
        <p className="im-sub">They'll get an email with a link to set their password.</p>

        <div className="set-field">
          <label>
            Name <i>*</i>
          </label>
          <input
            autoFocus
            required
            maxLength={120}
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="set-field">
          <label>
            Email <i>*</i>
          </label>
          <input
            type="email"
            required
            placeholder="teammate@brecx.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="set-field">
          <label>Role</label>
          <Select className="form-sel" value={role} options={ROLE_OPTIONS} onChange={setRole} />
          <small>Admins can manage members and workspace settings; Users can only edit their own profile.</small>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={sending} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
