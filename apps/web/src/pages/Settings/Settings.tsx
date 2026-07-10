import { Navigate, useNavigate, useParams } from "react-router-dom";
import { GeneralTab } from "./GeneralTab";
import { SecurityTab } from "./SecurityTab";
import { UsersTab } from "./UsersTab";
import { AiTab } from "./AiTab";

const TABS = ["general", "security", "users", "ai"] as const;
export type SettingsTab = (typeof TABS)[number];

/* Priceobo-style settings: slim sub-nav on the left (grouped Personal /
 * Workspace), stacked cards on the right. Each tab is its own route. */

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, JSX.Element> = {
    general: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </>
    ),
    security: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    ai: (
      <path d="M12 2.5c.5 4.8 2.2 6.5 7 7-4.8.5-6.5 2.2-7 7-.5-4.8-2.2-6.5-7-7 4.8-.5 6.5-2.2 7-7Z" />
    ),
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

export function Settings() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();

  if (!TABS.includes(tab as SettingsTab)) {
    return <Navigate to="/settings/general" replace />;
  }
  const active = tab as SettingsTab;

  const item = (key: SettingsTab, label: string) => (
    <button
      type="button"
      className={"sn-item" + (active === key ? " on" : "")}
      onClick={() => navigate(`/settings/${key}`)}
    >
      <NavIcon name={key} />
      {label}
    </button>
  );

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Workspace preferences, security and your team.</p>
        </div>
      </div>

      <div className="set-wrap">
        <nav className="set-nav" aria-label="Settings sections">
          <div className="sn-label">Personal</div>
          {item("general", "General")}
          {item("security", "Security")}
          <div className="sn-label">Workspace</div>
          {item("users", "Users")}
          {item("ai", "Claude AI")}
        </nav>

        <div className="set-body">
          {active === "general" && <GeneralTab />}
          {active === "security" && <SecurityTab />}
          {active === "users" && <UsersTab />}
          {active === "ai" && <AiTab />}
        </div>
      </div>
    </section>
  );
}
