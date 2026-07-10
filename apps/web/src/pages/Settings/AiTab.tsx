import { useCallback, useEffect, useState } from "react";
import { api, qs } from "../../lib/api";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useToast } from "../../components/Toast";

/* Settings → AI: default model picker + the spend ledger (Wholesale-style
 * daily bars, by-model table, range-scoped totals). */

type ModelKey = "haiku" | "sonnet" | "opus";

interface UsageData {
  daily: Array<{ day: string; cost: string; calls: number }>;
  byModel: Array<{
    model: string;
    calls: number;
    input: string;
    output: string;
    cache_read: string;
    cost: string;
  }>;
  totals: { cost: string; calls: number; input: string; output: string };
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTok = (v: string | number) => {
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export function AiTab() {
  const { toast } = useToast();
  const [configured, setConfigured] = useState(true);
  const [model, setModel] = useState<ModelKey>("haiku");
  const [models, setModels] = useState<Array<{ key: ModelKey; label: string; pricing: string }>>([]);
  const [from, setFrom] = useState<string | null>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return iso(d);
  });
  const [to, setTo] = useState<string | null>(iso(new Date()));
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    api
      .get<{ configured: boolean; defaultModel: ModelKey; models: typeof models }>("/assistant/config")
      .then((res) => {
        setConfigured(res.configured);
        setModel(res.defaultModel);
        setModels(res.models);
      })
      .catch(() => setConfigured(false));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const load = useCallback(() => {
    api
      .get<UsageData>(`/assistant/usage${qs({ from: from ?? "", to: to ?? "" })}`)
      .then(setData)
      .catch(() => setData(null));
  }, [from, to]);
  useEffect(load, [load]);

  async function pickDefault(k: ModelKey) {
    setModel(k);
    try {
      await api.post("/assistant/settings", { defaultModel: k });
      toast(`Default model set to ${models.find((m) => m.key === k)?.label ?? k}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  }

  const maxCost = Math.max(0.01, ...(data?.daily ?? []).map((d) => Number(d.cost)));

  return (
    <>
      <div className="card set-card">
        <div className="sc-head">
          <h2>Claude AI</h2>
          <span className="sc-sub">The assistant that drafts invoices from PDFs, spreadsheets and chat.</span>
        </div>
        <div className="sc-body">
          {!configured && (
            <div className="em-warn" style={{ marginBottom: 14 }}>
              Not configured — set <b>ANTHROPIC_API_KEY</b> in the API env to enable the assistant.
            </div>
          )}
          <span className="f-cap" style={{ display: "block", marginBottom: 8 }}>
            Default model
          </span>
          <div className="ai-model-pick">
            {models.map((m) => (
              <button
                key={m.key}
                type="button"
                className={"ai-model-opt" + (model === m.key ? " on" : "")}
                onClick={() => void pickDefault(m.key)}
              >
                <b>{m.label}</b>
                <span>{m.pricing}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card set-card">
        <div className="sc-head ai-spend-head">
          <div>
            <h2>AI spend</h2>
            <span className="sc-sub">Every assistant call, metered.</span>
          </div>
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
        </div>
        <div className="sc-body">
          <div className="ai-spend-cards">
            <div className="ai-spend-cell">
              <i>Total spend</i>
              <b className="num">${Number(data?.totals.cost ?? 0).toFixed(2)}</b>
            </div>
            <div className="ai-spend-cell">
              <i>API calls</i>
              <b className="num">{data?.totals.calls ?? 0}</b>
            </div>
            <div className="ai-spend-cell">
              <i>Tokens in / out</i>
              <b className="num">
                {fmtTok(data?.totals.input ?? 0)} / {fmtTok(data?.totals.output ?? 0)}
              </b>
            </div>
          </div>

          {data && data.daily.length > 0 ? (
            <div className="ai-chart" role="img" aria-label="Daily AI spend">
              {data.daily.map((d) => (
                <div className="ai-bar-wrap" key={String(d.day)}>
                  <span className="ai-bar-val num">${Number(d.cost).toFixed(2)}</span>
                  <span
                    className="ai-bar"
                    style={{ height: `${Math.max(4, (Number(d.cost) / maxCost) * 100)}%` }}
                    title={`${String(d.day).slice(0, 10)} · $${Number(d.cost).toFixed(2)} · ${d.calls} calls`}
                  />
                  <span className="ai-bar-day">{String(d.day).slice(5, 10)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="tab-note">No AI usage in this period yet — send the assistant a message and it shows up here.</p>
          )}

          {data && data.byModel.length > 0 && (
            <table className="ledger ai-bymodel">
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="right">Calls</th>
                  <th className="right">Tokens in / out</th>
                  <th className="right">Cache reads</th>
                  <th className="right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.byModel.map((m) => (
                  <tr key={m.model}>
                    <td>{m.model}</td>
                    <td className="num right">{m.calls}</td>
                    <td className="num right">
                      {fmtTok(m.input)} / {fmtTok(m.output)}
                    </td>
                    <td className="num right">{fmtTok(m.cache_read)}</td>
                    <td className="num right">${Number(m.cost).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
