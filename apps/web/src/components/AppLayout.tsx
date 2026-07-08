import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBilling, initialsOf } from "../lib/store";

/** Ledger shell straight from the mockup: light sidebar with brass spine,
 *  topbar with breadcrumb + search + New invoice. */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const { customers, invoices } = useBilling();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const openCount = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "draft" && i.status !== "void" && i.balance > 0,
  ).length;

  // ⌘K / Ctrl+K focuses the search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const crumb = pageName(pathname);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">Brecx Billing</div>
            <div className="brand-sub">Fresh Finest LLC</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">Workspace</div>
          <NavLink to="/dashboard">
            <DashIcon />
            <span className="t">Dashboard</span>
          </NavLink>
          <NavLink to="/invoices" end>
            <InvoiceIcon />
            <span className="t">Invoices</span>
            {openCount > 0 && <span className="count hot">{openCount}</span>}
          </NavLink>
          <NavLink to="/invoices/new">
            <PlusIcon />
            <span className="t">New invoice</span>
          </NavLink>
          <NavLink to="/customers">
            <CustomersIcon />
            <span className="t">Customers</span>
            <span className="count">{customers.length}</span>
          </NavLink>
          <NavLink to="/reports">
            <ReportsIcon />
            <span className="t">Reports</span>
          </NavLink>

          <div className="nav-label">Manage</div>
          <NavLink to="/payments">
            <PaymentsIcon />
            <span className="t">Payments</span>
          </NavLink>
          <NavLink to="/settings/template">
            <TemplateIcon />
            <span className="t">Template</span>
          </NavLink>
          <NavLink to="/settings/account">
            <GearIcon />
            <span className="t">Settings</span>
          </NavLink>
        </nav>

        <div className="side-foot">
          <div className="side-user">
            <div className="avatar">{initialsOf(user?.name || user?.email || "?")}</div>
            <div>
              <b>{user?.name || user?.email}</b>
              <span>{user?.role === "admin" ? "Owner" : "Member"} · Brecx</span>
            </div>
            <button
              type="button"
              className="side-signout"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => void signOut()}
            >
              <SignOutIcon />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumb">
            <span>Fresh Finest / </span>
            <span className="here">{crumb}</span>
          </div>
          <label className="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              placeholder="Search invoices, customers…"
              defaultValue={params.get("q") ?? ""}
              onChange={(e) => {
                const q = e.target.value;
                navigate(q ? `/invoices?q=${encodeURIComponent(q)}` : "/invoices", {
                  replace: pathname === "/invoices",
                });
              }}
            />
            <span className="kbd">⌘K</span>
          </label>
          <button className="btn btn-primary" onClick={() => navigate("/invoices/new")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New invoice
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function pageName(pathname: string): string {
  if (pathname.startsWith("/invoices/new")) return "New invoice";
  if (pathname.startsWith("/invoices")) return "Invoices";
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/payments")) return "Payments";
  if (pathname.startsWith("/settings/template")) return "Invoice template";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Dashboard";
}

function TemplateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2.5" width="16" height="19" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h4" />
      <circle cx="16.5" cy="16.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ---------- Sidebar icons (from the mockup) ---------- */

function DashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
function InvoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h9l4 4v16l-2.5-1.5L14 22l-2.5-1.5L9 22l-2.5-1.5L4 22V4a2 2 0 0 1 2-2z" />
      <path d="M9 8h7M9 12h7M9 16h4" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function CustomersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M16 14.7c2.6.3 4.7 2 5.5 4.8" />
    </svg>
  );
}
function ReportsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" />
    </svg>
  );
}
function PaymentsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.5-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.4-2.6a7 7 0 0 0 2-1.2l2.5 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2z" />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
