import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { templateSettingsSchema } from "@inv/shared";
import { api } from "../../lib/api";
import { paperFromDetail } from "../../lib/invoicePdf";
import { DEFAULT_TEMPLATE, type TemplateSettings } from "../../lib/template";
import { InvoicePaper, type PaperData } from "../../components/InvoicePaper";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Public, login-free invoice view — where a "Share Invoice Link" URL lands.
 *  Renders the invoice through the org's active template, read-only, with a
 *  print/save-PDF action. Invalid or expired tokens get a friendly notice. */
export function ShareInvoice() {
  const { token } = useParams();
  const [paper, setPaper] = useState<PaperData | null>(null);
  const [tpl, setTpl] = useState<TemplateSettings>(DEFAULT_TEMPLATE);
  const [error, setError] = useState<string | null>(null);

  // "Private & Secure" links gate on the customer's email address.
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  function applyPayload(res: { invoice: any; items: any[]; template: unknown }) {
    try {
      setTpl(templateSettingsSchema.parse(res.template ?? {}));
    } catch {
      setTpl(DEFAULT_TEMPLATE);
    }
    setPaper(paperFromDetail(res.invoice, res.items));
  }

  useEffect(() => {
    api
      .get<{ private?: boolean; invoice?: any; items?: any[]; template?: unknown }>(
        `/share/${token}`,
      )
      .then((res) => {
        if (res.private) setNeedEmail(true);
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        else applyPayload(res as any);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "This link has expired or been disabled."),
      );
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [token]);

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setVerifying(true);
    setVerifyErr(null);
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = await api.post<{ invoice: any; items: any[]; template: unknown }>(
        `/share/${token}/verify`,
        { email: email.trim() },
      );
      applyPayload(res);
      setNeedEmail(false);
    } catch (err) {
      setVerifyErr(err instanceof Error ? err.message : "Verification failed — try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="share-page">
      <header className="share-head print-hide">
        <span className="share-brand">{tpl.orgName || "Invoice"}</span>
        {paper && <span className="share-num">{paper.number}</span>}
        <div className="share-head-right">
          {paper && (
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Print / Save PDF
            </button>
          )}
        </div>
      </header>

      <main className="share-stage">
        {error ? (
          <div className="card share-err">
            <b>Link unavailable</b>
            <span>{error}</span>
          </div>
        ) : needEmail ? (
          <form className="card share-gate" onSubmit={verify}>
            <span className="share-gate-ic" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                <circle cx="12" cy="15.7" r=".7" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <b>This invoice is private</b>
            <span className="share-gate-note">
              Enter the email address this invoice was issued to and it opens right up.
            </span>
            <input
              type="email"
              required
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {verifyErr && <span className="share-gate-err">{verifyErr}</span>}
            <button type="submit" className="btn btn-primary" disabled={verifying}>
              {verifying ? "Checking…" : "View Invoice"}
            </button>
          </form>
        ) : !paper ? (
          <div className="share-loading" aria-hidden="true">
            <span className="skel-bar" style={{ width: "40%", height: 22 }} />
            <span className="skel-bar" style={{ width: "62%" }} />
            <span className="skel-bar" style={{ width: "100%", height: 320 }} />
          </div>
        ) : (
          <InvoicePaper tpl={tpl} data={paper} />
        )}
      </main>

      <footer className="share-foot print-hide">Powered by Brecx Billing</footer>
    </div>
  );
}
