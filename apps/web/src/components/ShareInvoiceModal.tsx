import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Invoice } from "../lib/store";
import { DatePicker } from "./DatePicker";
import { useToast } from "./Toast";

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Visibility = "public" | "private";
const VISIBILITY: Array<{ key: Visibility; label: string; desc: string }> = [
  {
    key: "public",
    label: "Public",
    desc: "Anyone with the link can access the complete invoice before its expiration date.",
  },
  {
    key: "private",
    label: "Private & Secure",
    desc: "Your customer verifies the email address the invoice was issued to before it opens.",
  },
];

/** Zoho-style "Share Invoice Link" — pick an expiry, generate a public
 *  tokened URL, copy it, or kill every live link for this invoice. */
export function ShareInvoiceModal({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const { toast } = useToast();

  // Zoho default: 90 days from the invoice due date (never in the past).
  const [expires, setExpires] = useState(() => {
    const d = new Date(`${invoice.due}T00:00:00`);
    d.setDate(d.getDate() + 90);
    const today = new Date();
    return dateKey(d < today ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90) : d);
  });
  const [url, setUrl] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [visOpen, setVisOpen] = useState(false);
  const activeVis = VISIBILITY.find((v) => v.key === visibility)!;

  useEffect(() => {
    api
      .get<{ active: number }>(`/invoices/${invoice.dbId}/share`)
      .then((res) => setActive(res.active))
      .catch(() => {});
  }, [invoice.dbId]);

  async function generate() {
    setBusy(true);
    try {
      const res = await api.post<{ token: string }>(`/invoices/${invoice.dbId}/share`, {
        expiresAt: expires,
        visibility,
      });
      setUrl(`${window.location.origin}/share/${res.token}`);
      setActive((a) => a + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't generate the link", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast("Invoice link copied to clipboard");
  }

  async function disableAll() {
    setBusy(true);
    try {
      const res = await api.post<{ disabled: number }>(`/invoices/${invoice.dbId}/share/disable`);
      setActive(0);
      setUrl(null);
      toast(`${res.disabled} link${res.disabled === 1 ? "" : "s"} disabled`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Share Invoice Link — {invoice.number}</h3>

        <div className="share-vis">
          Visibility
          <div className="share-vis-wrap">
            <button
              type="button"
              className={"share-pub" + (visOpen ? " open" : "")}
              onClick={() => setVisOpen((o) => !o)}
            >
              {activeVis.label}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {visOpen && (
              <>
                <div className="menu-pop share-vis-pop">
                  {VISIBILITY.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={"menu-item vis-item" + (visibility === v.key ? " active" : "")}
                      onClick={() => {
                        setVisibility(v.key);
                        setVisOpen(false);
                        setUrl(null); // a new visibility needs a fresh link
                      }}
                    >
                      <b>{v.label}</b>
                      <span>{v.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="views-backdrop" onClick={() => setVisOpen(false)} />
              </>
            )}
          </div>
        </div>
        <p className="share-note">
          {visibility === "public" ? (
            <>
              Select an expiration date and generate the link to share it with your customer.
              Remember that anyone who has access to this link can view, print or download it.
            </>
          ) : (
            <>
              Select an expiration date and generate the link to share it with your customer.
              The invoice opens only after they verify the email address it was issued to.
            </>
          )}
        </p>

        <div className="field">
          <DatePicker value={expires} onChange={setExpires} required />
          <small>Link expiration date — defaults to 90 days from the invoice due date</small>
        </div>

        {url && (
          <div className="share-url" title="The public link">
            {url}
          </div>
        )}

        <div className="modal-actions share-actions">
          {url ? (
            <button type="button" className="btn btn-primary" onClick={() => void copy()}>
              Copy Link
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void generate()}>
              {busy ? "Generating…" : "Generate Link"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || active === 0}
            title={active === 0 ? "No active links for this invoice" : `${active} active link${active === 1 ? "" : "s"}`}
            onClick={() => void disableAll()}
          >
            Disable All Active Links{active > 0 ? ` (${active})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
