import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { money, fmtShort } from "../../lib/store";
import { useTemplate } from "../../lib/template";
import { ActionIcon } from "../../components/bits";
import { DateRangePicker } from "../../components/DateRangePicker";
import { TableSkeleton } from "../../components/TableSkeleton";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";
import { REPORTS, type ReportCol } from "./reportDefs";

// Local-date ISO — toISOString() shifts to UTC and lands a day off east of it.
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Default range: this month. Cleared range (null) = all time. */
function thisMonth(): [string, string] {
  const now = new Date();
  return [
    iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  ];
}

function fmtCell(col: ReportCol, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (col.fmt) {
    case "money":
      return money(Number(v));
    case "date":
      return fmtShort(String(v).slice(0, 10));
    case "int":
      return Number(v).toLocaleString("en-US");
    case "status":
      return String(v).charAt(0).toUpperCase() + String(v).slice(1);
    default:
      return String(v);
  }
}

/** One shared shell for every report: filters → run → printable table. */
export function ReportView() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { template } = useTemplate();
  const def = REPORTS.find((r) => r.key === key);

  // null/null → all time; the report re-runs the moment the range changes.
  const [from, setFrom] = useState<string | null>(thisMonth()[0]);
  const [to, setTo] = useState<string | null>(thisMonth()[1]);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [rows, setRows] = useState<any[] | null>(null);

  const run = useCallback(
    async (range: [string, string]) => {
      if (!def) return;
      setRows(null);
      try {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const res = await api.get<{ rows: any[] }>(
          `/reports/${def.key}?from=${range[0]}&to=${range[1]}`,
        );
        setRows(res.rows);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to run report", "error");
        setRows([]);
      }
    },
    [def, toast],
  );

  useEffect(() => {
    void run([from ?? "1970-01-01", to ?? "2100-12-31"]);
  }, [run, from, to]);

  if (!def) {
    return (
      <section className="view">
        <div className="empty-note card" style={{ padding: 40 }}>
          <b>Report not found</b>
          <button className="crumb-btn" onClick={() => navigate("/reports")}>
            ← Back to Reports
          </button>
        </div>
      </section>
    );
  }

  const totals: Record<string, number> = {};
  for (const col of def.columns) {
    if (col.sum && rows) {
      totals[col.key] = rows.reduce((s, r) => s + Number(r[col.key] ?? 0), 0);
    }
  }
  const hasTotals = rows !== null && rows.length > 0 && Object.keys(totals).length > 0;

  function exportCsv() {
    if (!rows) return;
    downloadCsv(`brecx-${def!.key}.csv`, [
      def!.columns.map((c) => c.label),
      ...rows.map((r) => def!.columns.map((c) => fmtCell(c, r[c.key]).replace("—", ""))),
    ]);
    toast("Report exported as CSV");
  }

  return (
    <section className="view">
      <div className="page-head print-hide">
        <div>
          <p className="rv-crumb">
            <button type="button" className="crumb-btn" onClick={() => navigate("/reports")}>
              Reports
            </button>
            <span className="crumb-sep">/</span>
            {def.group}
          </p>
          <h1>{def.name}</h1>
          <p>{def.desc}</p>
        </div>
        <div className="right">
          <button className="btn btn-ghost" onClick={exportCsv} disabled={!rows?.length}>
            <ActionIcon name="download" /> Export
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            <ActionIcon name="printer" /> Print
          </button>
        </div>
      </div>

      <div className="rv-filters print-hide">
        <span className="rv-lab">Date range</span>
        <DateRangePicker
          start={from}
          end={to}
          onChange={(s, e) => {
            setFrom(s);
            setTo(e);
          }}
          onClear={() => {
            setFrom(null);
            setTo(null);
          }}
        />
        {!from && <span className="rv-alltime">Showing all time — pick a range to narrow it.</span>}
      </div>

      <div className="card">
        <div className="rv-head">
          <div>
            <h2>{def.name}</h2>
            <span className="rv-range">
              {template.orgName || "Fresh Finest"} ·{" "}
              {!from || !to ? (
                "all time"
              ) : (
                <>
                  {fmtShort(from)} — {fmtShort(to)}
                </>
              )}
            </span>
          </div>
          {rows !== null && rows.length > 0 && (
            <span className="rv-count num">
              {rows.length.toLocaleString("en-US")} row{rows.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="panel-body">
        {rows === null ? (
          <TableSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <div className="empty-note">
            <b>No data for this period</b>
            Try a wider date range.
          </div>
        ) : (
          <table className="ledger rv-table">
            <thead>
              <tr>
                {def.columns.map((c) => (
                  <th key={c.key} className={c.align === "right" ? "right" : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {def.columns.map((c) => (
                    <td
                      key={c.key}
                      className={
                        (c.align === "right" ? "num right" : c.fmt === "date" ? "num" : "") || undefined
                      }
                    >
                      {fmtCell(c, r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {hasTotals && (
                <tr className="rv-total">
                  {def.columns.map((c, i) => (
                    <td key={c.key} className={c.align === "right" ? "num right" : undefined}>
                      {i === 0
                        ? "Total"
                        : c.sum
                          ? c.fmt === "money"
                            ? money(totals[c.key])
                            : totals[c.key].toLocaleString("en-US")
                          : ""}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </section>
  );
}
