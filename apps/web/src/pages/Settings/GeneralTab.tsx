import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CURRENCIES } from "@inv/shared";
import { api, ApiError } from "../../lib/api";
import { fetchWorkspace, saveWorkspace, type WorkspaceSettings } from "../../lib/team";
import { Select } from "../../components/Select";
import { SearchSelect } from "../../components/SearchSelect";
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
      <div className="card set-card">
        <div className="sc-body set-loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
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
  );
}
