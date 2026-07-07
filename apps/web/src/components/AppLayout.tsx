import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Logo } from "./Logo";

/** Sidebar + main content wrapper. Sidebar has icon-driven nav items with a
 *  strong active state (brand-blue tint + left rail) and a pinned-to-bottom
 *  user card. */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const page = pageInfo(pathname);

  // Mobile nav drawer — closes whenever the route changes.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [pathname]);

  const initials =
    (user?.name || user?.email || "?")
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="app">
      {navOpen && <div className="nav-overlay" onClick={() => setNavOpen(false)} />}
      <aside className={"sidebar" + (navOpen ? " open" : "")}>
        <div className="brand">
          <Logo size={28} />
          <span>Invoice Brecx</span>
        </div>
        <nav className="nav">
          <div className="section">Billing</div>
          <NavLink to="/dashboard" className={pathname.startsWith("/dashboard") ? "active" : ""}>
            <GaugeIcon />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/invoices" className={pathname.startsWith("/invoices") ? "active" : ""}>
            <InvoiceIcon />
            <span>Invoices</span>
          </NavLink>
          <NavLink to="/clients" className={pathname.startsWith("/clients") ? "active" : ""}>
            <ClientsIcon />
            <span>Clients</span>
          </NavLink>
        </nav>

        <nav className="nav nav-bottom">
          <div className="section">Account</div>
          <NavLink to="/settings/account" className={pathname.startsWith("/settings") ? "active" : ""}>
            <GearIcon />
            <span>Settings</span>
          </NavLink>
        </nav>

        {user && (
          <div className="sidebar-user">
            <div className="user-card">
              <div className="user-avatar">{initials}</div>
              <div className="user-meta">
                <div className="user-name">{user.name || user.email}</div>
                <div className="user-sub">
                  {user.email} · {user.role}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="sign-out-btn"
              onClick={() => void signOut()}
            >
              <SignOutIcon />
              Sign out
            </button>
          </div>
        )}
      </aside>
      <div className="content">
        <header className="app-header">
          <div className="ah-left">
            <button
              type="button"
              className="menu-btn"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              <MenuIcon />
            </button>
            <div className="ah-titles">
              <div className="ah-crumb">{page.section}</div>
              <div className="ah-title">{page.title}</div>
            </div>
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Section + page name for the top header, derived from the route. */
function pageInfo(pathname: string): { section: string; title: string } {
  if (pathname.startsWith("/dashboard")) return { section: "Billing", title: "Dashboard" };
  if (pathname.startsWith("/invoices/")) return { section: "Billing", title: "Invoice Details" };
  if (pathname.startsWith("/invoices")) return { section: "Billing", title: "Invoices" };
  if (pathname.startsWith("/clients")) return { section: "Billing", title: "Clients" };
  if (pathname.startsWith("/settings")) return { section: "Account", title: "Settings" };
  return { section: "", title: "Invoice Brecx" };
}

/* ---------- Icons (Lucide-flavoured line icons) ---------- */

function GaugeIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}
function InvoiceIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function ClientsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
