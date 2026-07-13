import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CURRENCIES } from "@inv/shared";
import { api, ApiError } from "../../lib/api";
import { fetchWorkspace, saveWorkspace, type WorkspaceSettings } from "../../lib/team";
import { Select } from "../../components/Select";
import { SearchSelect } from "../../components/SearchSelect";
import { FormSkeleton } from "../../components/TableSkeleton";
import { useToast } from "../../components/Toast";

function timezones(): string[] {
  try {
    const list = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
      "timeZone",
    );
    if (list?.length) return list;
  } catch {
    /* old runtimes */
  }
  return ["America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dhaka", "UTC"];
}

export function GeneralTab() {
  const { toast } = useToast();
  const [ws, setWs] = useState<WorkspaceSettings | null>(null);
  const [terms, setTerms] = useState<string[]>(["Due on Receipt"]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchWorkspace()
      .then(setWs)
      .catch(() => toast("Couldn't load workspace settings", "error"));
    void api
      .get<{ terms: Array<{ name: string }> }>("/settings/payment-terms")
      .then((r) => setTerms(r.terms.map((t) => t.name)))
      .catch(() => {
        /* keep default */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tzOptions = useMemo(
    () => timezones().map((z) => ({ value: z, label: z.replace(/_/g, " ") })),
    [],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ws) return;
    setSaving(true);
    try {
      setWs(await saveWorkspace(ws));
      toast("Workspace settings saved");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the settings", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!ws) {
    return (
      <>
        <div className="card set-card" aria-busy="true">
          <div className="sc-head">
            <h2>Workspace</h2>
            <span className="sc-sub">General workspace configuration</span>
          </div>
          <div className="sc-body">
            <FormSkeleton fields={5} />
          </div>
        </div>
        <OrganizationCard />
      </>
    );
  }

  return (
    <>
    <form className="card set-card" onSubmit={onSubmit}>
      <div className="sc-head">
        <h2>Workspace</h2>
        <span className="sc-sub">General workspace configuration</span>
      </div>
      <div className="sc-body">
        <div className="set-field">
          <label>
            Workspace name <i>*</i>
          </label>
          <input
            value={ws.orgName}
            required
            maxLength={120}
            onChange={(e) => setWs({ ...ws, orgName: e.target.value })}
          />
          <small>Shown on invoices, statements and the emails this workspace sends.</small>
        </div>

        <div className="set-grid2">
          <div className="set-field">
            <label>Timezone</label>
            <SearchSelect
              options={tzOptions}
              value={ws.timezone}
              display={ws.timezone.replace(/_/g, " ")}
              onChange={(v) => setWs({ ...ws, timezone: v })}
            />
          </div>
          <div className="set-field">
            <label>Currency</label>
            <Select
              className="form-sel"
              value={ws.currency}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              onChange={(v) => setWs({ ...ws, currency: v })}
            />
          </div>
        </div>

        <div className="set-field" style={{ maxWidth: 360 }}>
          <label>Default payment terms</label>
          <Select
            className="form-sel"
            value={ws.defaultTerms}
            options={terms.map((t) => ({ value: t, label: t }))}
            onChange={(v) => setWs({ ...ws, defaultTerms: v })}
          />
          <small>Pre-selected on new customers and invoices.</small>
        </div>

        <div className="sc-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
    <OrganizationCard />
    </>
  );
}

interface OrgBranding {
  orgName: string;
  orgTagline: string;
  orgAddress: string;
  orgPhone: string;
  orgEmail: string;
  logoDataUrl: string;
}

/** Zoho-style Organization Profile: the ONE logo + business identity every
 *  invoice template prints with — replace or remove it here and every
 *  template, PDF, email and share link follows. */
function OrganizationCard() {
  const { toast } = useToast();
  const [b, setB] = useState<OrgBranding | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api
      .get<{ branding: OrgBranding }>("/settings/branding")
      .then((r) => setB(r.branding))
      .catch(() => toast("Couldn't load the organization profile", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onLogoPick(file: File | undefined) {
    if (!file || !b) return;
    if (file.size > 300_000) {
      toast("Logo must be under 300 KB — export a smaller PNG/SVG.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setB({ ...b, logoDataUrl: String(reader.result ?? "") });
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!b) return;
    setSaving(true);
    try {
      const res = await api.put<{ branding: OrgBranding }>("/settings/branding", b);
      setB(res.branding);
      toast("Organization profile saved — every template now uses it");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the profile", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!b) {
    return (
      <div className="card set-card" aria-busy="true">
        <div className="sc-head">
          <h2>Organization profile</h2>
          <span className="sc-sub">Logo and business identity printed on every invoice</span>
        </div>
        <div className="sc-body">
          <FormSkeleton fields={4} />
        </div>
      </div>
    );
  }

  return (
    <form className="card set-card" onSubmit={onSubmit}>
      <div className="sc-head">
        <h2>Organization profile</h2>
        <span className="sc-sub">
          Logo and business identity printed on every invoice — one copy, used by all templates.
        </span>
      </div>
      <div className="sc-body">
        <div className="set-field">
          <label>Invoice logo</label>
          <div className="logo-row">
            {b.logoDataUrl ? (
              <img className="logo-thumb" src={b.logoDataUrl} alt="Organization logo" />
            ) : (
              <div className="logo-thumb empty">No logo</div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                onLogoPick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              {b.logoDataUrl ? "Replace logo" : "Upload logo"}
            </button>
            {b.logoDataUrl && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setB({ ...b, logoDataUrl: "" })}
              >
                Remove
              </button>
            )}
          </div>
          <small>
            PNG/JPG under 300 KB. Changing it here updates every template, invoice, PDF and
            share link at once.
          </small>
        </div>

        <div className="set-grid2">
          <div className="set-field">
            <label>
              Company name <i>*</i>
            </label>
            <input
              value={b.orgName}
              required
              maxLength={200}
              onChange={(e) => setB({ ...b, orgName: e.target.value })}
            />
          </div>
          <div className="set-field">
            <label>Tagline</label>
            <input
              value={b.orgTagline}
              maxLength={200}
              onChange={(e) => setB({ ...b, orgTagline: e.target.value })}
            />
          </div>
        </div>

        <div className="set-field">
          <label>Address</label>
          <textarea
            rows={2}
            value={b.orgAddress}
            maxLength={500}
            onChange={(e) => setB({ ...b, orgAddress: e.target.value })}
          />
          <small>One line per row, exactly as it should print on the paper.</small>
        </div>

        <div className="set-grid2">
          <div className="set-field">
            <label>Phone</label>
            <input
              value={b.orgPhone}
              maxLength={60}
              onChange={(e) => setB({ ...b, orgPhone: e.target.value })}
            />
          </div>
          <div className="set-field">
            <label>Email</label>
            <input
              value={b.orgEmail}
              maxLength={200}
              onChange={(e) => setB({ ...b, orgEmail: e.target.value })}
            />
          </div>
        </div>

        <div className="sc-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
