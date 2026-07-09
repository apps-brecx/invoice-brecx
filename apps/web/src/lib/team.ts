import { api } from "./api";

/* Settings module API surface: workspace prefs, team members, invitations,
 * active sessions. */

export interface WorkspaceSettings {
  orgName: string;
  timezone: string;
  currency: string;
  defaultTerms: string;
}

export interface TeamUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

export interface Invitation {
  id: number;
  email: string;
  name: string | null;
  role: string;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  inviteUrl: string;
}

export interface SessionInfo {
  sid: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export const fetchWorkspace = () =>
  api.get<{ workspace: WorkspaceSettings }>("/settings/workspace").then((r) => r.workspace);
export const saveWorkspace = (w: WorkspaceSettings) =>
  api.put<{ workspace: WorkspaceSettings }>("/settings/workspace", w).then((r) => r.workspace);

export const fetchTeam = () => api.get<{ users: TeamUser[] }>("/users").then((r) => r.users);
export const updateMember = (id: number, body: { name?: string; role?: string }) =>
  api.patch(`/users/${id}`, body);
export const removeUser = (id: number) => api.del(`/users/${id}`);

export const fetchInvitations = () =>
  api.get<{ invitations: Invitation[] }>("/users/invitations").then((r) => r.invitations);
export const sendInvitation = (body: { name: string; email: string; role: string }) =>
  api.post<{ invitation: Invitation; emailed: boolean }>("/users/invitations", body);
export const resendInvitation = (id: number) =>
  api.post<{ invitation: Invitation; emailed: boolean }>(`/users/invitations/${id}/resend`);
export const cancelInvitation = (id: number) => api.del(`/users/invitations/${id}`);

export const fetchSessions = () =>
  api.get<{ sessions: SessionInfo[] }>("/me/sessions").then((r) => r.sessions);
export const revokeSession = (sid: string) => api.del(`/me/sessions/${sid}`);

/* ------------------------------ display helpers ------------------------------ */

/** "Chrome on Windows 10/11" from a raw user-agent string. */
export function parseUA(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows NT 10/.test(ua)
    ? "Windows 10/11"
    : /Windows/.test(ua)
      ? "Windows"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Android/.test(ua)
            ? "Android"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return os ? `${browser} on ${os}` : browser;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const fmtShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
