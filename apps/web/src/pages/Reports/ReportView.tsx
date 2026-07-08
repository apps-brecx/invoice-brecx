import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { money, fmtShort } from "../../lib/store";
import { useTemplate } from "../../lib/template";
import { DatePicker } from "../../components/DatePicker";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";
import { REPORTS, type ReportCol } from "./reportDefs";

/* Zoho-style date-range presets. */
type Preset = "this-month" | "last-month" | "this-quarter" | "this-year" | "all-time" | "custom";
const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: "this-month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
  { key: "this-quarter", label: "This Quarter" },
  { key: "this-year", label: "This Year" },
  { key: "all-time", label: "All Time" },
  { key: "custom", label: "Custom" },
];

// Local-date ISO — toISOString() shifts to UTC and lands a day off east of it.
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(p: Preset): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case "this-month":
      return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case "last-month":
      return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "this-quarter": {
      const qs = Math.floor(m / 3) * 3;
      return [iso(new Date(y, qs, 1)), iso(new Date(y, qs + 3, 0))];
    }
    case "this-year":
      return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    default:
      return ["1970-01-01", "2100-12-31"];
  }
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

  const [preset, setPreset] = useState<Preset>("this-month");
  const [customFrom, setCustomFrom] = useState(presetRange("this-month")[0]);
  const [customTo, setCustomTo] = useState(presetRange("this-month")[1]);
  const [applied, setApplied] = useState<[string, string]>(presetRange("this-month"));
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
    void run(applied);
  }, [run, applied]);

  if (!def) {
    return (
      <section className="view">
        <div className="empty-note card" style={{ padding: 40 }}>
          <b>Report not found</b>
          <button className="link" onClick={() => navigate("/reports")}>
            ← Back to Reports Center
          </button>
        </div>
      </section>
    );
  }

  const range: [string, string] =
    preset === "custom" ? [customFrom, customTo] : presetRange(preset);

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
            <button className="link" onClick={() => navigate("/reports")}>
              Reports
            </button>{" "}
            / {def.group}
          </p>
          <h1>{def.name}</h1>
        </div>
        <div className="right">
          <button className="btn btn-ghost" onClick={exportCsv} disabled={!rows?.length}>
            ⤓ Export
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            ⎙ Print
          </button>
          <button className="icon-btn" title="Back to Reports Center" onClick={() => navigate("/reports")}>
            ✕
          </button>
        </div>
      </div>

      <div className="rv-filters print-hide">
        <span className="rv-lab">Filters :</span>
        <div className="field" style={{ margin: 0 }}>
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <small>Date range</small>
        </div>
        {preset === "custom" && (
          <>
            <div className="field" style={{ margin: 0 }}>
              <DatePicker value={customFrom} onChange={setCustomFrom} />
              <small>From</small>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <DatePicker value={customTo} onChange={setCustomTo} />
              <small>To</small>
            </div>
          </>
        )}
        <button className="btn btn-primary" onClick={() => setApplied(range)}>
          Run Report
        </button>
      </div>

      <div className="card rv-paper">
        <div className="rv-head">
          <span className="rv-org">{template.orgName || "Fresh Finest"}</span>
          <h2>{def.name}</h2>
          <span className="rv-range">
            {applied[0] === "1970-01-01" ? (
              "All time"
            ) : (
              <>
                From <b>{fmtShort(applied[0])}</b> To <b>{fmtShort(applied[1])}</b>
              </>
            )}
          </span>
        </div>
        {rows === null ? (
          <div className="center-fill" style={{ minHeight: 160 }}>
            <div className="spinner" />
          </div>
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
    </section>
  );
}
