import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TemplateRecord } from "../lib/template";
import { fetchTemplates, activateTemplate } from "../lib/template";
import { InvoicePaper, SAMPLE_PAPER } from "./InvoicePaper";
import { useToast } from "./Toast";

/* Zoho-style "Customize invoice" right drawer. Home view shows preference
 * cards; "PDF Template" flips to the Choose Template view listing every
 * saved template with live previews — clicking one makes it active. */

export function CustomizeDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [view, setView] = useState<"home" | "templates">("home");
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await fetchTemplates());
    } catch {
      /* stays empty */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pick(t: TemplateRecord) {
    if (t.active) return;
    setSavingId(t.id);
    try {
      await activateTemplate(t.id);
      await load();
      toast(`Template switched to "${t.name}"`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to switch template", "error");
    } finally {
      setSavingId(null);
    }
  }

  const shown = templates.filter((t) =>
    t.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          {view === "templates" && (
            <button type="button" className="icon-btn" aria-label="Back" onClick={() => setView("home")}>
              ←
            </button>
          )}
          <h3>{view === "home" ? "Customize invoice" : "Choose Template"}</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {view === "home" ? (
          <div className="drawer-body">
            <div className="drawer-sec">
              <b>General Preferences</b>
              <p>Controls and customises the invoice paper and its defaults.</p>
            </div>

            <button type="button" className="pref-card" onClick={() => setView("templates")}>
              <span className="pref-ic">▤</span>
              <span>
                <b>PDF Template</b>
                <small>Choose from your saved templates for invoice PDFs.</small>
              </span>
            </button>

            <button
              type="button"
              className="pref-card"
              onClick={() => {
                onClose();
                navigate("/settings/template");
              }}
            >
              <span className="pref-ic">✎</span>
              <span>
                <b>Template Editor</b>
                <small>
                  Manage templates — edit any of them, create new ones, logo, colors, fonts,
                  columns, all with live preview.
                </small>
              </span>
            </button>

            <div className="drawer-sec">
              <b>Coming with the Settings module</b>
            </div>
            <div className="pref-card disabled">
              <span className="pref-ic">⚙</span>
              <span>
                <b>Transaction Preferences</b>
                <small>Default discount, tax and rounding rules.</small>
              </span>
            </div>
            <div className="pref-card disabled">
              <span className="pref-ic">⌂</span>
              <span>
                <b>Address Formats</b>
                <small>How organization and customer addresses print on invoices.</small>
              </span>
            </div>
          </div>
        ) : (
          <div className="drawer-body">
            <div className="picker-search drawer-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                autoFocus
                placeholder="Search Template"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="tpl-cards">
              {shown.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={"tpl-card" + (t.active ? " on" : "")}
                  disabled={savingId !== null}
                  onClick={() => void pick(t)}
                >
                  <span className="tpl-thumb">
                    <span className="tpl-thumb-inner">
                      <InvoicePaper tpl={t.settings} data={SAMPLE_PAPER} />
                    </span>
                  </span>
                  {t.active && <span className="tpl-selected">★ SELECTED</span>}
                  <span className="tpl-name">{savingId === t.id ? "Applying…" : t.name}</span>
                </button>
              ))}
              {shown.length === 0 && <div className="picker-empty">No template matches.</div>}
            </div>

            <button
              type="button"
              className="picker-new"
              style={{ marginTop: 14, borderTop: 0 }}
              onClick={() => {
                onClose();
                navigate("/settings/template");
              }}
            >
              ⊕ New template / edit templates
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
