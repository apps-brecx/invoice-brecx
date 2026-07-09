import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, apiUrl } from "../lib/api";
import { fileToBase64, fmtBytes, docMime, DOC_ACCEPT } from "../lib/files";
import type { Customer } from "../lib/store";
import { COUNTRIES, COUNTRY_NAMES } from "../lib/countries";
import { usePaymentTerms } from "../lib/terms";
import { SearchSelect, type SSOption } from "./SearchSelect";
import { Select } from "./Select";
import { useToast } from "./Toast";

const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."];
const LANGUAGES = ["English", "Bengali", "Hindi", "Spanish", "French", "German", "Chinese", "Arabic"];

const SALUTATION_OPTIONS = [
  { value: "", label: "Salutation" },
  ...SALUTATIONS.map((s) => ({ value: s, label: s })),
];

const DIAL_OPTIONS: SSOption[] = COUNTRIES.map((c) => ({
  value: c.dial,
  label: c.name,
  tag: c.dial,
}));

const COUNTRY_OPTIONS: SSOption[] = COUNTRY_NAMES.map((n) => ({ value: n, label: n }));

type Tab = "other" | "address" | "contacts" | "custom" | "remarks";

interface ContactPerson {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  workPhone: string;
  mobile: string;
}
const EMPTY_CP: ContactPerson = {
  salutation: "",
  firstName: "",
  lastName: "",
  email: "",
  workPhone: "",
  mobile: "",
};

/** Stored phones look like "+1 5551234" — split back into dial + number. */
function splitDial(v: string | null | undefined): [string, string] {
  const s = (v ?? "").trim();
  if (s.startsWith("+")) {
    const sp = s.indexOf(" ");
    if (sp > 0) return [s.slice(0, sp), s.slice(sp + 1)];
  }
  return ["+1", s];
}

interface Address {
  attention: string;
  country: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  fax: string;
}

const EMPTY_ADDR: Address = {
  attention: "",
  country: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  fax: "",
};

/** Zoho-parity New/Edit Customer form — used from the Customers page and
 *  inline from the invoice form. Saves straight to the API. Pass `initial`
 *  (the raw client row) to edit instead of create. */
export function AddCustomerModal({
  onClose,
  onAdded,
  initial,
  initialTab,
}: {
  onClose: () => void;
  onAdded: (c: Customer) => void | Promise<void>;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  initial?: any;
  /** Open on a specific tab (e.g. "address" from the overview's quick links). */
  initialTab?: Tab;
}) {
  const { toast } = useToast();
  const { terms: termOptions } = usePaymentTerms();
  const [iWorkDial, iWorkPhone] = splitDial(initial?.phone);
  const [iMobDial, iMobile] = splitDial(initial?.mobile);
  const [type, setType] = useState<"Business" | "Individual">(
    initial?.type === "Individual" ? "Individual" : "Business",
  );
  const [salutation, setSalutation] = useState(initial?.salutation ?? "");
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [displayName, setDisplayName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [workDial, setWorkDial] = useState(iWorkDial);
  const [workPhone, setWorkPhone] = useState(iWorkPhone);
  const [mobileDial, setMobileDial] = useState(iMobDial);
  const [mobile, setMobile] = useState(iMobile);
  const [language, setLanguage] = useState(initial?.language ?? "English");
  const [tab, setTab] = useState<Tab>(initialTab ?? "other");
  // Other details
  const [terms, setTerms] = useState(initial?.payment_terms ?? "Due on Receipt");
  const [portal, setPortal] = useState(Boolean(initial?.portal_enabled));
  const [moreOpen, setMoreOpen] = useState(Boolean(initial?.website || initial?.department));
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [designation, setDesignation] = useState(initial?.designation ?? "");
  const [twitter, setTwitter] = useState(initial?.twitter ?? "");
  const [skype, setSkype] = useState(initial?.skype ?? "");
  const [facebook, setFacebook] = useState(initial?.facebook ?? "");
  // Addresses
  const [billing, setBilling] = useState<Address>(
    initial
      ? {
          attention: initial.billing_attention ?? "",
          country: initial.country ?? "",
          street1: initial.address_line1 ?? "",
          street2: initial.address_line2 ?? "",
          city: initial.city ?? "",
          state: initial.billing_state ?? "",
          zip: initial.postal_code ?? "",
          phone: initial.billing_phone ?? "",
          fax: initial.billing_fax ?? "",
        }
      : EMPTY_ADDR,
  );
  const [shipping, setShipping] = useState<Address>(
    initial
      ? {
          attention: initial.shipping_attention ?? "",
          country: initial.shipping_country ?? "",
          street1: initial.shipping_street1 ?? "",
          street2: initial.shipping_street2 ?? "",
          city: initial.shipping_city ?? "",
          state: initial.shipping_state ?? "",
          zip: initial.shipping_zip ?? "",
          phone: initial.shipping_phone ?? "",
          fax: initial.shipping_fax ?? "",
        }
      : EMPTY_ADDR,
  );
  // Contact persons
  const [contacts, setContacts] = useState<ContactPerson[]>(
    Array.isArray(initial?.contact_persons) ? initial.contact_persons : [],
  );
  // Remarks
  const [remarks, setRemarks] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Documents (Zoho-style): existing ones load in edit mode; new picks are
  // queued locally and uploaded right after Save (create mode has no id yet).
  interface ClientDoc {
    id: number;
    filename: string;
    mime: string;
    size_bytes: number;
  }
  const MAX_DOCS = 3;
  const docRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [queuedDocs, setQueuedDocs] = useState<File[]>([]);
  useEffect(() => {
    if (!initial?.id) return;
    api
      .get<{ documents: ClientDoc[] }>(`/clients/${initial.id}/documents`)
      .then((r) => setDocs(r.documents))
      .catch(() => {});
  }, [initial?.id]);

  function pickDoc(file: File | undefined | null) {
    if (!file) return;
    if (docs.length + queuedDocs.length >= MAX_DOCS) {
      toast(`A customer can have at most ${MAX_DOCS} documents`, "error");
      return;
    }
    if (!docMime(file)) {
      toast("Use a PDF, image, CSV, TXT or Office file", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("File is larger than 10 MB", "error");
      return;
    }
    setQueuedDocs((cur) => [...cur, file]);
    if (docRef.current) docRef.current.value = "";
  }

  async function deleteDoc(docId: number) {
    if (!initial?.id) return;
    try {
      await api.del(`/clients/${initial.id}/documents/${docId}`);
      setDocs((cur) => cur.filter((d) => d.id !== docId));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete document", "error");
    }
  }

  // Zoho-style display-name suggestions built from what's typed so far.
  const suggestions = useMemo(() => {
    const fl = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    const lf = [lastName.trim(), firstName.trim()].filter(Boolean).join(", ");
    return [...new Set([company.trim(), fl, lf].filter(Boolean))];
  }, [firstName, lastName, company]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: displayName.trim(),
        type,
        salutation: salutation || null,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        company: company.trim() || null,
        currency: "USD",
        email: email.trim() || null,
        phone: workPhone.trim() ? `${workDial} ${workPhone.trim()}` : null,
        mobile: mobile.trim() ? `${mobileDial} ${mobile.trim()}` : null,
        language,
        paymentTerms: terms,
        portalEnabled: portal,
        website: website.trim() || null,
        department: department.trim() || null,
        designation: designation.trim() || null,
        twitter: twitter.trim() || null,
        skype: skype.trim() || null,
        facebook: facebook.trim() || null,
        billingAttention: billing.attention.trim() || null,
        addressLine1: billing.street1.trim() || null,
        addressLine2: billing.street2.trim() || null,
        city: billing.city.trim() || null,
        state: billing.state.trim() || null,
        postalCode: billing.zip.trim() || null,
        country: billing.country.trim() || null,
        billingPhone: billing.phone.trim() || null,
        billingFax: billing.fax.trim() || null,
        shippingAttention: shipping.attention.trim() || null,
        shippingStreet1: shipping.street1.trim() || null,
        shippingStreet2: shipping.street2.trim() || null,
        shippingCity: shipping.city.trim() || null,
        shippingState: shipping.state.trim() || null,
        shippingZip: shipping.zip.trim() || null,
        shippingCountry: shipping.country.trim() || null,
        shippingPhone: shipping.phone.trim() || null,
        shippingFax: shipping.fax.trim() || null,
        notes: remarks.trim() || null,
        contactPersons: contacts.filter(
          (c) => c.firstName || c.lastName || c.email || c.workPhone || c.mobile,
        ),
      };
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const { client } = initial
        ? await api.put<{ client: any }>(`/clients/${initial.id}`, payload)
        : await api.post<{ client: any }>("/clients", payload);
      // Queued documents upload once the customer exists.
      for (const f of queuedDocs) {
        const data = await fileToBase64(f);
        await api.post(`/clients/${client.id}/documents`, {
          filename: f.name,
          mime: docMime(f),
          data,
        });
      }
      await onAdded({
        id: client.id,
        name: client.name,
        type: client.type,
        terms: client.payment_terms,
        company: client.company,
        email: client.email,
        phone: client.phone,
        addressLine1: client.address_line1,
        addressLine2: client.address_line2,
        city: client.city ?? "",
        postalCode: client.postal_code,
        country: client.country,
        lifetime: 0,
        avgPayDays: null,
        active: client.active ?? true,
        dotBg: "var(--green-soft)",
        dotFg: "var(--green)",
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save customer", "error");
      setSaving(false);
    }
  }

  const setCp = (i: number, patch: Partial<ContactPerson>) =>
    setContacts((cur) => cur.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>{initial ? "Edit Customer" : "New Customer"}</h3>

        <div className="modal-body">
        <ZRow label="Customer type">
          <div className="radio-row">
            <label className="check">
              <input
                type="radio"
                name="ctype"
                checked={type === "Business"}
                onChange={() => setType("Business")}
              />
              Business
            </label>
            <label className="check">
              <input
                type="radio"
                name="ctype"
                checked={type === "Individual"}
                onChange={() => setType("Individual")}
              />
              Individual
            </label>
          </div>
        </ZRow>

        <ZRow label="Primary contact">
          <div className="z-inline">
            <Select
              className="form-sel"
              value={salutation}
              options={SALUTATION_OPTIONS}
              onChange={setSalutation}
              ariaLabel="Salutation"
            />
            <input
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </ZRow>

        <ZRow label="Company name">
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </ZRow>

        <ZRow label="Display name" required>
          <input
            required
            list="display-name-suggestions"
            placeholder="Select or type to add"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <datalist id="display-name-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </ZRow>

        <ZRow label="Currency">
          <select value="USD" disabled>
            <option value="USD">USD — United States Dollar</option>
          </select>
        </ZRow>

        <ZRow label="Email address">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </ZRow>

        <ZRow label="Phone">
          <div className="z-inline">
            <div className="phone-group">
              <SearchSelect
                compact
                options={DIAL_OPTIONS}
                value={workDial}
                onChange={setWorkDial}
              />
              <input
                placeholder="Work phone"
                value={workPhone}
                onChange={(e) => setWorkPhone(e.target.value)}
              />
            </div>
            <div className="phone-group">
              <SearchSelect
                compact
                options={DIAL_OPTIONS}
                value={mobileDial}
                onChange={setMobileDial}
              />
              <input placeholder="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </div>
          </div>
        </ZRow>

        <ZRow label="Customer language">
          <Select
            className="form-sel block"
            value={language}
            options={LANGUAGES}
            onChange={setLanguage}
            ariaLabel="Customer language"
          />
        </ZRow>

        <div className="tabs">
          {(
            [
              ["other", "Other Details"],
              ["address", "Address"],
              ["contacts", "Contact Persons"],
              ["custom", "Custom Fields"],
              ["remarks", "Remarks"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={"tab" + (tab === key ? " on" : "")}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "other" && (
          <div className="tab-body">
            <ZRow label="Payment terms">
              <select value={terms} onChange={(e) => setTerms(e.target.value)}>
                {termOptions.map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
              </select>
            </ZRow>
            <ZRow label="Enable portal?">
              <label className="check">
                <input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} />
                Allow portal access for this customer
              </label>
            </ZRow>
            <ZRow label="Documents">
              <div className="doc-up">
                <button
                  type="button"
                  className="btn btn-ghost doc-btn"
                  disabled={docs.length + queuedDocs.length >= MAX_DOCS}
                  onClick={() => docRef.current?.click()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 8l5-5 5 5M12 3v12" />
                  </svg>
                  Upload File
                </button>
                <small className="doc-hint">
                  You can upload a maximum of {MAX_DOCS} files, 10 MB each
                </small>
                <input
                  ref={docRef}
                  type="file"
                  accept={DOC_ACCEPT}
                  style={{ display: "none" }}
                  onChange={(e) => pickDoc(e.target.files?.[0])}
                />
                {(docs.length > 0 || queuedDocs.length > 0) && (
                  <div className="doc-list">
                    {docs.map((d) => (
                      <div className="doc-row" key={d.id}>
                        <DocIcon />
                        <a
                          className="doc-name"
                          href={apiUrl(`/clients/${initial.id}/documents/${d.id}`)}
                          target="_blank"
                          rel="noreferrer"
                          title="Open document"
                        >
                          {d.filename}
                        </a>
                        <span className="doc-size">{fmtBytes(Number(d.size_bytes))}</span>
                        <button
                          type="button"
                          className="doc-x"
                          title="Delete document"
                          onClick={() => void deleteDoc(d.id)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {queuedDocs.map((f, i) => (
                      <div className="doc-row pending" key={`q${i}`}>
                        <DocIcon />
                        <span className="doc-name">{f.name}</span>
                        <span className="doc-size">{fmtBytes(f.size)} · uploads on save</span>
                        <button
                          type="button"
                          className="doc-x"
                          title="Remove"
                          onClick={() => setQueuedDocs((cur) => cur.filter((_, j) => j !== i))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ZRow>

            {!moreOpen ? (
              <button type="button" className="link-btn more-link" onClick={() => setMoreOpen(true)}>
                Add more details
              </button>
            ) : (
              <>
                <ZRow label="Website URL">
                  <input
                    placeholder="ex: www.zylker.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </ZRow>
                <ZRow label="Department">
                  <input value={department} onChange={(e) => setDepartment(e.target.value)} />
                </ZRow>
                <ZRow label="Designation">
                  <input value={designation} onChange={(e) => setDesignation(e.target.value)} />
                </ZRow>
                <ZRow label="X" hint="https://x.com/">
                  <input value={twitter} onChange={(e) => setTwitter(e.target.value)} />
                </ZRow>
                <ZRow label="Skype name/number">
                  <input value={skype} onChange={(e) => setSkype(e.target.value)} />
                </ZRow>
                <ZRow label="Facebook" hint="http://www.facebook.com/">
                  <input value={facebook} onChange={(e) => setFacebook(e.target.value)} />
                </ZRow>
              </>
            )}
          </div>
        )}

        {tab === "address" && (
          <div className="tab-body addr-grid">
            <AddressFields title="Billing Address" addr={billing} onChange={setBilling} />
            <AddressFields
              title="Shipping Address"
              addr={shipping}
              onChange={setShipping}
              extra={
                <button type="button" className="link-btn" onClick={() => setShipping({ ...billing })}>
                  ↓ Copy billing address
                </button>
              }
            />
          </div>
        )}

        {tab === "contacts" && (
          <div className="tab-body">
            {contacts.length > 0 && (
              <div className="cp-cards">
                {contacts.map((c, i) => (
                  <div className="cp-card" key={i}>
                    <button
                      type="button"
                      className="icon-btn cp-remove"
                      title="Remove contact person"
                      onClick={() => setContacts((cur) => cur.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                    <div className="cp-row name-row">
                      <Select
                        className="form-sel"
                        value={c.salutation}
                        options={SALUTATION_OPTIONS}
                        onChange={(v) => setCp(i, { salutation: v })}
                        ariaLabel="Salutation"
                      />
                      <input
                        placeholder="First name"
                        value={c.firstName}
                        onChange={(e) => setCp(i, { firstName: e.target.value })}
                      />
                      <input
                        placeholder="Last name"
                        value={c.lastName}
                        onChange={(e) => setCp(i, { lastName: e.target.value })}
                      />
                    </div>
                    <div className="cp-row">
                      <input
                        type="email"
                        placeholder="Email address"
                        value={c.email}
                        onChange={(e) => setCp(i, { email: e.target.value })}
                      />
                      <input
                        placeholder="Work phone"
                        value={c.workPhone}
                        onChange={(e) => setCp(i, { workPhone: e.target.value })}
                      />
                      <input
                        placeholder="Mobile"
                        value={c.mobile}
                        onChange={(e) => setCp(i, { mobile: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="add-line"
              onClick={() => setContacts((cur) => (cur.length < 10 ? [...cur, { ...EMPTY_CP }] : cur))}
            >
              + Add Contact Person
            </button>
          </div>
        )}

        {tab === "custom" && (
          <div className="tab-body">
            <p className="tab-note">
              Custom fields for customers are coming with the Settings module — you'll define
              them once and they'll show up here and on the invoice paper.
            </p>
          </div>
        )}

        {tab === "remarks" && (
          <div className="tab-body">
            <ZRow label="Remarks" hint="(for internal use)">
              <textarea rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </ZRow>
          </div>
        )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
    </svg>
  );
}

function ZRow({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="z-row">
      <label className={required ? "req" : undefined}>
        {label}
        {required && " *"}
        {hint && <small>{hint}</small>}
      </label>
      <div className="z-field">{children}</div>
    </div>
  );
}

function AddressFields({
  title,
  addr,
  onChange,
  extra,
}: {
  title: string;
  addr: Address;
  onChange: (a: Address) => void;
  extra?: ReactNode;
}) {
  const set = (patch: Partial<Address>) => onChange({ ...addr, ...patch });
  return (
    <div className="addr-col">
      <div className="addr-head">
        <h4>{title}</h4>
        {extra}
      </div>
      <input
        placeholder="Attention"
        value={addr.attention}
        onChange={(e) => set({ attention: e.target.value })}
      />
      <SearchSelect
        options={COUNTRY_OPTIONS}
        value={addr.country}
        onChange={(v) => set({ country: v })}
        placeholder="Country / Region"
      />
      <textarea
        rows={2}
        placeholder="Street 1"
        value={addr.street1}
        onChange={(e) => set({ street1: e.target.value })}
      />
      <textarea
        rows={2}
        placeholder="Street 2"
        value={addr.street2}
        onChange={(e) => set({ street2: e.target.value })}
      />
      <div className="z-inline">
        <input placeholder="City" value={addr.city} onChange={(e) => set({ city: e.target.value })} />
        <input placeholder="State" value={addr.state} onChange={(e) => set({ state: e.target.value })} />
      </div>
      <div className="z-inline">
        <input placeholder="ZIP code" value={addr.zip} onChange={(e) => set({ zip: e.target.value })} />
        <input placeholder="Phone" value={addr.phone} onChange={(e) => set({ phone: e.target.value })} />
      </div>
      <input placeholder="Fax number" value={addr.fax} onChange={(e) => set({ fax: e.target.value })} />
    </div>
  );
}
