import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { REPORTS, REPORT_GROUPS, COMING_SOON, type ReportDef } from "./reportDefs";

const FAV_KEY = "brecx-report-favs";

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Zoho-style Reports Center — searchable hub of grouped report links. */
export function Reports() {
  const navigate = useNavigate();
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
  const match = (r: ReportDef) => !needle || r.name.toLowerCase().includes(needle);
  const favReports = REPORTS.filter((r) => favs.has(r.key) && match(r));

  const row = (r: ReportDef) => (
    <div className="rc-row" key={r.key}>
      <button className="rc-link" title={r.desc} onClick={() => navigate(`/reports/${r.key}`)}>
        {r.name}
      </button>
      <button
        className={"rc-star" + (favs.has(r.key) ? " on" : "")}
        title={favs.has(r.key) ? "Remove from favorites" : "Add to favorites"}
        onClick={() => toggleFav(r.key)}
      >
        {favs.has(r.key) ? "★" : "☆"}
      </button>
    </div>
  );

  const soonRows = (items: string[], why: string) =>
    items
      .filter((n) => !needle || n.toLowerCase().includes(needle))
      .map((n) => (
        <div className="rc-row soon" key={n} title={why}>
          <span className="rc-link">{n}</span>
          <small>soon</small>
        </div>
      ));

  return (
    <section className="view rc-center">
      <h1 className="rc-title">Reports Center</h1>
      <div className="rc-search">
        <input placeholder="Search reports" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card rc-card">
        {favReports.length > 0 && (
          <div className="rc-group">
            <h3>★ Favorites</h3>
            <div className="rc-grid">{favReports.map(row)}</div>
          </div>
        )}

        {REPORT_GROUPS.map((g) => {
          const rows = REPORTS.filter((r) => r.group === g && match(r));
          const soon = COMING_SOON.find((c) => c.group === g);
          const soonEls = soon ? soonRows(soon.items, soon.why) : [];
          if (rows.length === 0 && soonEls.length === 0) return null;
          return (
            <div className="rc-group" key={g}>
              <h3>{g}</h3>
              <div className="rc-grid">
                {rows.map(row)}
                {soonEls}
              </div>
            </div>
          );
        })}

        {COMING_SOON.filter((c) => !REPORT_GROUPS.includes(c.group)).map((c) => {
          const soonEls = soonRows(c.items, c.why);
          if (soonEls.length === 0) return null;
          return (
            <div className="rc-group" key={c.group}>
              <h3>{c.group}</h3>
              <div className="rc-grid">{soonEls}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
