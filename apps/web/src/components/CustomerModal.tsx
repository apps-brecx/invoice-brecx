import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Customer } from "../lib/store";
import { COUNTRIES, COUNTRY_NAMES } from "../lib/countries";
import { usePaymentTerms } from "../lib/terms";
import { SearchSelect, type SSOption } from "./SearchSelect";
import { useToast } from "./Toast";

const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."];
const LANGUAGES = ["English", "Bengali", "Hindi", "Spanish", "French", "German", "Chinese", "Arabic"];

const DIAL_OPTIONS: SSOption[] = COUNTRIES.map((c) => ({
  value: c.dial,
  label: c.name,
  tag: c.dial,
}));

const COUNTRY_OPTIONS: SSOption[] = COUNTRY_NAMES.map((n) => ({ value: n, label: n }));

type Tab = "other" | "address" | "custom" | "remarks";

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

/** Zoho-parity New Customer form — used from the Customers page and inline
 *  from the invoice form. Saves straight to the API. */
export function AddCustomerModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (c: Customer) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const { terms: termOptions } = usePaymentTerms();
  const [type, setType] = useState<"Business" | "Individual">("Business");
  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [workDial, setWorkDial] = useState("+1");
  const [workPhone, setWorkPhone] = useState("");
  const [mobileDial, setMobileDial] = useState("+1");
  const [mobile, setMobile] = useState("");
  const [language, setLanguage] = useState("English");
  const [tab, setTab] = useState<Tab>("other");
  // Other details
  const [terms, setTerms] = useState("Due on Receipt");
  const [portal, setPortal] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [website, setWebsite] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [twitter, setTwitter] = useState("");
  const [skype, setSkype] = useState("");
  const [facebook, setFacebook] = useState("");
  // Addresses
  const [billing, setBilling] = useState<Address>(EMPTY_ADDR);
  const [shipping, setShipping] = useState<Address>(EMPTY_ADDR);
  // Remarks
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

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
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const { client } = await api.post<{ client: any }>("/clients", {
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
      });
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
        dotBg: "var(--green-soft)",
        dotFg: "var(--green)",
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add customer", "error");
      setSaving(false);
    }
  }

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
        <h3>New Customer</h3>

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
            <select
              value={salutation}
              onChange={(e) => setSalutation(e.target.value)}
              style={{ maxWidth: 110 }}
            >
              <option value="">Salutation</option>
              {SALUTATIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
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
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </ZRow>

        <div className="tabs">
          {(
            [
              ["other", "Other Details"],
              ["address", "Address"],
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
