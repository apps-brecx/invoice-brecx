import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useBilling, money } from "../../lib/store";
import { EmptyState, SearchOffIcon } from "../../components/EmptyState";
import { REPORTS, REPORT_GROUPS, type ReportDef } from "./reportDefs";

const FAV_KEY = "brecx-report-favs";

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/* One line icon per report — same stroke language as the rest of the app. */
const ICONS: Record<string, ReactNode> = {
  "sales-by-customer": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16.5 3.5a4 4 0 0 1 0 9M18 14.7c2.6.3 4.7 2 5.5 4.8" />
    </>
  ),
  "sales-by-item": (
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </>
  ),
  "ar-aging-summary": (
    <>
      <path d="M6 2h12M6 22h12" />
      <path d="M7 2v4.5c0 2 5 4 5 5.5s-5 3.5-5 5.5V22M17 2v4.5c0 2-5 4-5 5.5s5 3.5 5 5.5V22" />
    </>
  ),
  "ar-aging-details": (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  "invoice-details": (
    <>
      <path d="M6 2h9l4 4v16l-2.5-1.5L14 22l-2.5-1.5L9 22l-2.5-1.5L4 22V4a2 2 0 0 1 2-2z" />
      <path d="M9 8h7M9 12h7M9 16h4" />
    </>
  ),
  "customer-balance-summary": (
    <>
      <path d="M12 3v18M5 21h14" />
      <path d="M5 7l-3 6a3.5 3.5 0 0 0 6 0l-3-6ZM19 7l-3 6a3.5 3.5 0 0 0 6 0l-3-6Z" />
      <path d="M4 7h16" />
    </>
  ),
  "bad-debts": (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m5.5 5.5 13 13" />
    </>
  ),
  "payments-received": (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  "time-to-get-paid": (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7v5l3.2 1.9" />
    </>
  ),
};

function RepIcon({ k }: { k: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[k]}
    </svg>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Reports hub — every card is a working report; group headers carry a live
 *  figure straight from the store so the page reads like a ledger index. */
export function Reports() {
  const navigate = useNavigate();
  const { invoices, summary, loading } = useBilling();
  const [q, setQ] = useState("");
  const [favs, setFavs] = useState<Set<string>>(loadFavs);

  const toggleFav = (key: string) => {
    setFavs((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const needle = q.trim().toLowerCase();
  const match = (r: ReportDef) =>
    !needle || r.name.toLowerCase().includes(needle) || r.desc.toLowerCase().includes(needle);
  const pinned = REPORTS.filter((r) => favs.has(r.key) && match(r));
  const anyMatch = REPORTS.some(match);

  // Live group figures — everything's already in the store, no extra fetches.
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const salesThisMonth = invoices
    .filter((i) => i.status !== "draft" && i.status !== "void" && i.issued.startsWith(monthKey))
    .reduce((s, i) => s + i.total, 0);
  const receivedTotal = invoices.reduce((s, i) => s + i.paid, 0);
  const GROUP_STATS: Record<string, { label: string; value: string }> = {
    Sales: { label: "invoiced this month", value: money(salesThisMonth) },
    Receivables: { label: "outstanding now", value: money(summary.outstanding) },
    "Payments Received": { label: "received to date", value: money(receivedTotal) },
  };

  const card = (r: ReportDef, i: number) => (
    <div
      key={r.key}
      role="button"
      tabIndex={0}
      className="rep-card"
      style={{ animationDelay: `${i * 45}ms` }}
      onClick={() => navigate(`/reports/${r.key}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/reports/${r.key}`);
        }
      }}
    >
      <span className="rep-ic">
        <RepIcon k={r.key} />
      </span>
      <span
        className={"rep-pin" + (favs.has(r.key) ? " on" : "")}
        role="button"
        tabIndex={0}
        title={favs.has(r.key) ? "Unpin" : "Pin to the top"}
        aria-label={favs.has(r.key) ? `Unpin ${r.name}` : `Pin ${r.name}`}
        onClick={(e) => {
          e.stopPropagation();
          toggleFav(r.key);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            toggleFav(r.key);
          }
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={favs.has(r.key) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
          <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9L12 2.8Z" />
        </svg>
      </span>
      <b>{r.name}</b>
      <span className="rep-desc">{r.desc}</span>
      <span className="rep-go">
        Run report
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </div>
  );

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Nine live reports over your invoices, customers and payments — run, print or export any of them.</p>
        </div>
      </div>

      <div className="list-toolbar">
        <label className="list-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reports by name or what they show…"
          />
          {q && (
            <button type="button" className="ls-clear" aria-label="Clear search" onClick={() => setQ("")}>
              ✕
            </button>
          )}
        </label>
      </div>

      {!anyMatch ? (
        <EmptyState
          icon={<SearchOffIcon />}
          title="No report matches"
          note="Try a different word — e.g. “aging”, “sales” or “payments”."
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <div className="rep-sec">
              <div className="rep-sec-head">
                <h3>Pinned</h3>
                <span className="rep-tick" aria-hidden />
              </div>
              <div className="rep-grid">{pinned.map(card)}</div>
            </div>
          )}

          {REPORT_GROUPS.map((g) => {
            const rows = REPORTS.filter((r) => r.group === g && match(r));
            if (rows.length === 0) return null;
            const stat = GROUP_STATS[g];
            return (
              <div className="rep-sec" key={g}>
                <div className="rep-sec-head">
                  <h3>{g}</h3>
                  <span className="rep-tick" aria-hidden />
                  {stat && (
                    <span className="rep-stat">
                      <i>{stat.label}</i>
                      {loading ? (
                        <span className="skel-bar" style={{ width: 66, height: 13 }} />
                      ) : (
                        <b className="num">{stat.value}</b>
                      )}
                    </span>
                  )}
                </div>
                <div className="rep-grid">{rows.map(card)}</div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
