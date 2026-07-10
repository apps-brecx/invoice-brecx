import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { money, useBilling } from "../../lib/store";
import { buildNotifs, TONE_LABEL, useNotifRead } from "../../lib/notifications";
import { Pagination } from "../../components/Pagination";

const PAGE_SIZE = 10;

/* Settings → Notifications: the full ledger behind the topbar bell —
 * every invoice that still needs attention, overdue first, paged. */

export function NotificationsTab() {
  const navigate = useNavigate();
  const { invoices } = useBilling();
  const notifs = useMemo(() => buildNotifs(invoices), [invoices]);
  const [read, setRead] = useNotifRead();
  const unread = notifs.filter((n) => !read.has(n.id));

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(notifs.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = notifs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const open = (id: string, dbId: number) => {
    setRead(new Set(read).add(id));
    navigate(`/invoices/${dbId}`);
  };

  return (
    <div className="card set-card">
      <div className="sc-head ntf-head">
        <div>
          <h2>Notifications</h2>
          <span className="sc-sub">
            {notifs.length === 0
              ? "Invoices that need attention show up here."
              : unread.length > 0
                ? `${unread.length} unread of ${notifs.length} — overdue first.`
                : `All ${notifs.length} caught up — overdue first.`}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost sc-head-btn"
          disabled={unread.length === 0}
          onClick={() => setRead(new Set(notifs.map((n) => n.id)))}
        >
          Mark all read
        </button>
      </div>
      <div className="sc-body ntf-body">
        {notifs.length === 0 ? (
          <p className="tab-note">
            You're all caught up — invoices awaiting payment, due soon or overdue will be listed here.
          </p>
        ) : (
          <>
            <table className="ledger ntf-table">
              <thead>
                <tr>
                  <th className="ntf-th-status">Status</th>
                  <th>Notification</th>
                  <th className="right">Balance</th>
                  <th className="right">Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr
                    key={n.id}
                    className={read.has(n.id) ? "read" : "unread"}
                    tabIndex={0}
                    onClick={() => open(n.id, n.dbId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(n.id, n.dbId);
                      }
                    }}
                  >
                    <td>
                      <span className={`ntf-tone ${n.tone}`}>{TONE_LABEL[n.tone]}</span>
                    </td>
                    <td>
                      <span className="ntf-title">
                        {!read.has(n.id) && <span className="ntf-dot" aria-label="Unread" />}
                        {n.title}
                      </span>
                    </td>
                    <td className="num right">{money(n.amount)}</td>
                    <td className="right ntf-due">{n.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pageCount > 1 && (
              <div className="ntf-foot">
                <span className="lf-info">
                  {notifs.length} notification{notifs.length === 1 ? "" : "s"} · page {safePage} of {pageCount}
                </span>
                <Pagination page={safePage} pages={pageCount} onPage={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
