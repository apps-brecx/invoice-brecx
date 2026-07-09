import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBilling, initialsOf, money, type Invoice } from "../lib/store";
import { Tooltip } from "./Tooltip";

interface Notif {
  id: string;
  tone: "crit" | "warn" | "info";
  title: string;
  time: string;
  dbId: number;
}

/** Notifications are derived live from real invoice data — anything still
 *  owed becomes an activity entry, most-overdue first. No fake data. */
function buildNotifs(invoices: Invoice[]): Notif[] {
  return invoices
    .filter((i) => i.balance > 0 && i.status !== "paid" && i.status !== "draft" && i.status !== "void")
    .sort((a, b) => a.dueInDays - b.dueInDays)
    .map((i) => {
      const overdue = i.status === "overdue" || i.dueInDays < 0;
      const soon = !overdue && i.dueInDays <= 7;
      const d = Math.abs(i.dueInDays);
      const amt = money(i.balance);
      return {
        id: `inv-${i.dbId}`,
        tone: overdue ? "crit" : soon ? "warn" : "info",
        title: overdue
          ? `Invoice ${i.number} to ${i.customerName} is overdue`
          : i.dueInDays === 0
            ? `Invoice ${i.number} is due today`
            : `Invoice ${i.number} awaiting payment`,
        time: overdue
          ? `${amt} · overdue by ${d} day${d === 1 ? "" : "s"}`
          : i.dueInDays === 0
            ? `${amt} · due today`
            : `${amt} · due in ${i.dueInDays} day${i.dueInDays === 1 ? "" : "s"}`,
        dbId: i.dbId,
      };
    });
}

/** Ledger shell: light sidebar with brass spine + a Priceobo-style topbar
 *  (page eyebrow + title on the left, notification / help actions on the right). */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const { customers, invoices } = useBilling();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const openCount = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "draft" && i.status !== "void" && i.balance > 0,
  ).length;

  const notifs = useMemo(() => buildNotifs(invoices), [invoices]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const unread = notifs.filter((n) => !readIds.has(n.id));
  const notifRef = useRef<HTMLDivElement>(null);

  // Paged list: 8 per page with Previous / Next controls.
  const NOTIF_PAGE = 8;
  const [notifPage, setNotifPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(notifs.length / NOTIF_PAGE));
  const page = Math.min(notifPage, pageCount - 1);
  const pageNotifs = notifs.slice(page * NOTIF_PAGE, (page + 1) * NOTIF_PAGE);

  useEffect(() => {
    if (!notifOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!notifRef.current?.contains(e.target as Node)) setNotifOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNotifOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen]);

  const markAllRead = () => setReadIds(new Set(notifs.map((n) => n.id)));
  const openNotif = (n: Notif) => {
    setReadIds((cur) => new Set(cur).add(n.id));
    setNotifOpen(false);
    navigate(`/invoices/${n.dbId}`);
  };

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
          <NavLink to="/items">
            <ItemsIcon />
            <span className="t">Items</span>
            <Tooltip label="New item">
            <span
              className="nav-add"
              role="button"
              tabIndex={0}
              aria-label="New item"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate("/items/new");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate("/items/new");
                }
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            </Tooltip>
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
          <div className="tb-head">
            <span className="tb-eyebrow">{sectionName(pathname)}</span>
            <span className="tb-title">{crumb}</span>
          </div>
          <div className="tb-actions">
            <div className="notif-wrap" ref={notifRef}>
              <Tooltip
                label={
                  notifOpen
                    ? ""
                    : unread.length > 0
                      ? `${unread.length} unread notification${unread.length === 1 ? "" : "s"}`
                      : "Notifications"
                }
                side="bottom"
              >
                <button
                  type="button"
                  className="tb-icon"
                  aria-label="Notifications"
                  onClick={() =>
                    setNotifOpen((o) => {
                      if (!o) setNotifPage(0);
                      return !o;
                    })
                  }
                >
                  <BellIcon />
                  {unread.length > 0 && <span className="dot live" />}
                </button>
              </Tooltip>
              {notifOpen && (
                <div className="notif-panel">
                  <div className="notif-head">
                    <div>
                      <h4>Notifications</h4>
                      <div className="sub">
                        {unread.length > 0 ? `${unread.length} unread` : "You're all caught up"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="notif-mark"
                      disabled={unread.length === 0}
                      onClick={markAllRead}
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="notif-list">
                    {notifs.length === 0 ? (
                      <div className="notif-empty">No notifications yet — invoices needing attention show up here.</div>
                    ) : (
                      pageNotifs.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className={"notif-item " + (readIds.has(n.id) ? "read" : "unread")}
                          onClick={() => openNotif(n)}
                        >
                          <span className={"notif-icon " + n.tone}>$</span>
                          <span className="notif-body">
                            <span className="notif-title">{n.title}</span>
                            <span className="notif-time">{n.time}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  {pageCount > 1 && (
                    <div className="notif-pager">
                      <button
                        type="button"
                        className="pg-btn"
                        disabled={page === 0}
                        onClick={() => setNotifPage(page - 1)}
                      >
                        ‹ Previous
                      </button>
                      <span className="pg-info">
                        {page + 1} / {pageCount}
                      </span>
                      <button
                        type="button"
                        className="pg-btn"
                        disabled={page >= pageCount - 1}
                        onClick={() => setNotifPage(page + 1)}
                      >
                        Next ›
                      </button>
                    </div>
                  )}
                  <div className="notif-foot">
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        navigate("/invoices");
                      }}
                    >
                      View all notifications →
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Tooltip label="Help & reports" side="bottom">
              <button
                type="button"
                className="tb-icon"
                aria-label="Help"
                onClick={() => navigate("/reports")}
              >
                <HelpIcon />
              </button>
            </Tooltip>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function sectionName(pathname: string): string {
  if (/^\/(payments|settings)/.test(pathname)) return "Manage";
  return "Workspace";
}

function pageName(pathname: string): string {
  if (pathname.startsWith("/invoices/new")) return "New invoice";
  if (pathname.startsWith("/invoices")) return "Invoices";
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/items/new")) return "New item";
  if (pathname.startsWith("/items")) return "Items";
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

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.8 2.5-2.8 2.5" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none" />
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
function ItemsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
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
