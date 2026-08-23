// src/pages/website/WebsiteSettingsPage.jsx – Website Settings (Admin)
import React, { useEffect, useState } from "react";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

const getLogoUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^(https?:|data:|blob:)/i.test(raw)) {
    return buildAssetUrl(raw);
  }

  const cleaned = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  return buildAssetUrl(`/${cleaned}`);
};

const DELIVERY_LIMIT_KEYS = [
  "standard_truck_limit_width_mm",
  "standard_truck_limit_height_mm",
  "standard_truck_limit_depth_mm",
];

const SECTION_META = {
  display: {
    label: "Website Details",
    icon: "🖼️",
    description: "Brand, website sections, and public business information.",
  },
  payment: {
    label: "Payments",
    icon: "💳",
    description: "Payment methods and customer payment details.",
  },
  email: {
    label: "Email Notifications",
    icon: "📧",
    description: "Admin alerts and customer email updates.",
  },
  policy: {
    label: "Policies",
    icon: "📋",
    description: "Warranty and cancellation settings.",
  },
  delivery: {
    label: "Truck Capacity",
    icon: "🚚",
    description:
      "Usable internal measurements for the standard delivery truck.",
  },
};

const KEY_META = {
  site_logo: {
    label: "Site Logo",
    type: "image",
    hint: "Shown in the customer website header and footer.",
    width: "logo",
  },
  site_name: {
    label: "Business Name",
    type: "text",
    hint: "Displayed in the browser tab and customer-facing website details.",
    width: "wide",
  },
  show_faq_section: {
    label: "FAQ Section",
    type: "toggle",
    hint: "Show or hide the FAQ section on the customer website.",
  },
  show_about_section: {
    label: "About Us Section",
    type: "toggle",
    hint: "Show or hide the About Us section.",
  },
  show_contact_section: {
    label: "Contact Us Section",
    type: "toggle",
    hint: "Show or hide the Contact Us section.",
  },
  business_address: {
    label: "Business Address",
    type: "text",
    hint: "Shown in the customer footer.",
    width: "wide",
  },
  // WISDOM GOOGLE MAPS PIN V1
  business_latitude: {
    label: "Business Latitude",
    type: "number",
    hint: "Latitude of the exact business pin shown in Google Maps.",
    width: "number",
    min: -90,
    max: 90,
    step: 0.000001,
  },
  business_longitude: {
    label: "Business Longitude",
    type: "number",
    hint: "Longitude of the exact business pin shown in Google Maps.",
    width: "number",
    min: -180,
    max: 180,
    step: 0.000001,
  },
  google_maps_place_id: {
    label: "Google Maps Place ID",
    type: "text",
    hint: "Recommended for opening the exact Spiral Wood Services business listing.",
    width: "wide",
  },
  business_phone: {
    label: "Business Phone",
    type: "text",
    hint: "Shown in customer contact information.",
    width: "phone",
    pattern: /^09\d{9}$/,
    patternMessage:
      "Business phone must be exactly 11 digits and start with '09'.",
  },
  business_email: {
    label: "Business Email",
    type: "text",
    hint: "Public business email shown to customers.",
    width: "email",
  },
  social_facebook: {
    label: "Facebook Page URL",
    type: "text",
    hint: "Link to the official Facebook page.",
    width: "wide",
  },
  social_instagram: {
    label: "Instagram Profile URL",
    type: "text",
    hint: "Optional link to the official Instagram profile.",
    width: "wide",
  },
  social_telegram: {
    label: "Telegram URL",
    type: "text",
    hint: "Optional link to the official Telegram account or channel.",
    width: "wide",
  },
  operating_hours: {
    label: "Operating Hours",
    type: "textarea",
    hint: "Shown in the customer footer. Use line breaks for multiple days.",
    width: "wide",
  },

  cod_enabled: {
    label: "Cash on Delivery",
    type: "toggle",
    hint: "Allow customers to select Cash on Delivery at checkout.",
  },
  cop_enabled: {
    label: "Cash on Pickup",
    type: "toggle",
    hint: "Allow customers to select Cash on Pickup.",
  },
  gcash_enabled: {
    label: "GCash",
    type: "toggle",
    hint: "Allow GCash as a payment option.",
  },
  bank_transfer_enabled: {
    label: "Bank Transfer",
    type: "toggle",
    hint: "Allow Bank Transfer as a payment option.",
  },
  gcash_number: {
    label: "GCash Number",
    type: "text",
    hint: "Shown to customers during GCash checkout.",
    width: "phone",
    pattern: /^09\d{9}$/,
    patternMessage:
      "GCash number must be exactly 11 digits and start with '09'.",
  },
  bank_account_name: {
    label: "Bank Account Name",
    type: "text",
    hint: "Account name shown during bank transfer checkout.",
    width: "accountName",
  },
  bank_account_number: {
    label: "Bank Account Number",
    type: "text",
    hint: "Account number shown during bank transfer checkout.",
    width: "accountNumber",
  },

  admin_alert_email: {
    label: "Admin Alert Email",
    type: "text",
    hint: "Receives important order and blueprint request alerts.",
    width: "email",
  },
  email_order_confirmed: {
    label: "Order Confirmed Email",
    type: "toggle",
    hint: "Email the customer when an order is confirmed.",
  },
  email_production_started: {
    label: "Production Started Email",
    type: "toggle",
    hint: "Email the customer when custom furniture enters production.",
  },
  email_out_for_delivery: {
    label: "Out for Delivery Email",
    type: "toggle",
    hint: "Email the customer when a rider is dispatched.",
  },
  email_footer: {
    label: "Email Footer Text",
    type: "textarea",
    hint: "Appended to outgoing system emails.",
    width: "message",
  },
  checkout_note: {
    label: "Checkout Note",
    type: "textarea",
    hint: "Message shown to customers during checkout.",
    width: "message",
  },

  warranty_period_days: {
    label: "Warranty Period",
    type: "number",
    suffix: "days",
    min: 1,
    step: 1,
    hint: "Warranty period counted from order completion.",
    width: "number",
  },
  cancellation_fee_pct: {
    label: "Cancellation Fee",
    type: "number",
    suffix: "%",
    min: 0,
    max: 100,
    step: 0.01,
    hint: "Fee applied to eligible custom order cancellations after down payment.",
    width: "number",
  },

  standard_truck_limit_width_mm: {
    label: "Internal Width",
    type: "number",
    suffix: "mm",
    min: 1,
    max: 20000,
    step: 1,
    hint: "Use the actual usable internal cargo width.",
    width: "number",
  },
  standard_truck_limit_height_mm: {
    label: "Internal Height",
    type: "number",
    suffix: "mm",
    min: 1,
    max: 20000,
    step: 1,
    hint: "Use the smaller usable cargo height or loading door opening.",
    width: "number",
  },
  standard_truck_limit_depth_mm: {
    label: "Internal Length",
    type: "number",
    suffix: "mm",
    min: 1,
    max: 20000,
    step: 1,
    hint: "Measure from the loading opening to the front wall.",
    width: "number",
  },
};

const TAB_KEYS = {
  display: [
    "site_logo",
    "site_name",
    "show_faq_section",
    "show_about_section",
    "show_contact_section",
    "business_address",
    "business_latitude",
    "business_longitude",
    "google_maps_place_id",
    "business_phone",
    "business_email",
    "social_facebook",
    "social_instagram",
    "social_telegram",
    "operating_hours",
  ],
  payment: [
    "cod_enabled",
    "cop_enabled",
    "gcash_enabled",
    "bank_transfer_enabled",
    "gcash_number",
    "bank_account_name",
    "bank_account_number",
  ],
  email: [
    "admin_alert_email",
    "email_order_confirmed",
    "email_production_started",
    "email_out_for_delivery",
    "email_footer",
    "checkout_note",
  ],
  policy: ["warranty_period_days", "cancellation_fee_pct"],
  delivery: DELIVERY_LIMIT_KEYS,
};

// WISDOM SITE LOGO 5MB LIMIT V1
export default function WebsiteSettingsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [settings, setSettings] = useState({});
  const [dirty, setDirty] = useState({});
  const [logoFile, setLogoFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("display");

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        setLoadError("");
        const { data } = await api.get("/website/settings");
        if (cancelled) return;

        const flat = {};
        Object.values(data || {}).forEach((group) => {
          if (group && typeof group === "object") Object.assign(flat, group);
        });

        setSettings(flat);
        setPreview(getLogoUrl(flat.site_logo));
      } catch (error) {
        if (cancelled) return;

        const message =
          error.response?.data?.message || "Unable to load website settings.";

        setLoadError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key, val) => {
    setSettings((current) => ({ ...current, [key]: val }));
    setDirty((current) => ({ ...current, [key]: val }));
  };

  const validateSettings = () => {
    const deliveryChanged = DELIVERY_LIMIT_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(dirty, key),
    );

    if (deliveryChanged) {
      const values = DELIVERY_LIMIT_KEYS.map((key) => Number(settings[key]));

      if (
        values.some(
          (value) => !Number.isFinite(value) || value <= 0 || value > 20000,
        )
      ) {
        setActiveTab("delivery");
        toast.error(
          "Enter valid internal truck width, height, and length limits in millimeters.",
        );
        return false;
      }
    }

    const mapLocationChanged = [
      "business_latitude",
      "business_longitude",
      "google_maps_place_id",
    ].some((key) => Object.prototype.hasOwnProperty.call(dirty, key));

    if (mapLocationChanged) {
      const latitudeRaw = String(settings.business_latitude ?? "").trim();
      const longitudeRaw = String(settings.business_longitude ?? "").trim();

      if ((latitudeRaw && !longitudeRaw) || (!latitudeRaw && longitudeRaw)) {
        setActiveTab("display");
        toast.error("Enter both Business Latitude and Business Longitude.");
        return false;
      }

      if (latitudeRaw && longitudeRaw) {
        const latitude = Number(latitudeRaw);
        const longitude = Number(longitudeRaw);

        if (
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90 ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          setActiveTab("display");
          toast.error(
            "Enter valid business latitude and longitude coordinates.",
          );
          return false;
        }
      }
    }

    for (const key of Object.keys(dirty)) {
      const meta = KEY_META[key];
      const value = settings[key];

      if (meta?.pattern && value && !meta.pattern.test(value)) {
        const targetTab = Object.entries(TAB_KEYS).find(([, keys]) =>
          keys.includes(key),
        )?.[0];

        if (targetTab) setActiveTab(targetTab);

        toast.error(meta.patternMessage || `Invalid format for ${meta.label}`);
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateSettings()) return;

    setSaving(true);

    try {
      const fd = new FormData();

      Object.entries(dirty).forEach(([key, value]) => {
        if (key !== "site_logo") fd.append(key, value);
      });

      if (logoFile) fd.append("site_logo", logoFile);

      await api.put("/website/settings", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Settings saved.");
      setDirty({});
      setLogoFile(null);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to save website settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  const hasDirty = Object.keys(dirty).length > 0 || logoFile !== null;

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (hasDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDirty]);

  if (loading) {
    return <div className="website-settings-state">Loading settings...</div>;
  }

  if (loadError) {
    return (
      <div className="website-settings-error">
        <h2>Unable to load Website Settings</h2>
        <p>{loadError}</p>
        <button
          type="button"
          className="website-settings-primary"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  const activeMeta = SECTION_META[activeTab];
  const activeKeys = TAB_KEYS[activeTab] || [];

  return (
    <div className="website-settings-vertical-v1">
      <style>{`
        .website-settings-vertical-v1 {
          width: min(100%, 1480px);
          margin: 0 auto;
          color: #18181b;
        }

        .website-settings-vertical-v1 *,
        .website-settings-vertical-v1 *::before,
        .website-settings-vertical-v1 *::after {
          box-sizing: border-box;
        }

        .website-settings-vertical-v1 button,
        .website-settings-vertical-v1 input,
        .website-settings-vertical-v1 textarea {
          font: inherit;
        }

        .website-settings-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 18px;
        }

        .website-settings-title {
          margin: 0;
          color: #18181b;
          font-size: 24px;
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .website-settings-subtitle {
          max-width: 780px;
          margin: 4px 0 0;
          color: #71717a;
          font-size: 12.5px;
          line-height: 1.5;
          font-weight: 400;
        }

        .website-settings-primary {
          min-height: 40px;
          padding: 0 16px;
          border: 1px solid #111111;
          border-radius: 3px;
          background: #111111;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
          font-size: 11.5px;
          font-weight: 600;
          white-space: nowrap;
        }

        .website-settings-primary.saved {
          border-color: #d5d8dd;
          background: #f5f5f5;
          color: #666d77;
          cursor: default;
        }

        .website-settings-unsaved {
          margin-bottom: 15px;
          padding: 10px 12px;
          border: 1px solid #ead9a4;
          border-left: 3px solid #b58a18;
          border-radius: 3px;
          background: #fffdf5;
          color: #705816;
          font-size: 12px;
          line-height: 1.45;
          font-weight: 400;
        }

        .website-settings-unsaved strong {
          font-weight: 700;
        }

        .website-settings-tabs {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          border-bottom: 1px solid #dfe2e6;
          margin-bottom: 18px;
        }

        .website-settings-tab {
          min-height: 46px;
          padding: 0 12px;
          border: 0;
          border-bottom: 2px solid transparent;
          background: transparent;
          color: #6f7680;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
        }

        .website-settings-tab.active {
          border-bottom-color: #18181b;
          color: #18181b;
          font-weight: 700;
        }

        .website-settings-tab-icon {
          font-size: 14px;
          line-height: 1;
        }

        .website-settings-panel {
          border: 1px solid #e1e4e8;
          border-radius: 4px;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
        }

        .website-settings-panel-head {
          padding: 16px 20px 14px;
          border-bottom: 1px solid #e7e9ec;
          background: #fafafa;
        }

        .website-settings-panel-head h2 {
          margin: 0;
          color: #191b20;
          font-size: 17px;
          line-height: 1.3;
          font-weight: 740;
        }

        .website-settings-panel-head p {
          margin: 5px 0 0;
          color: #777e88;
          font-size: 12px;
          line-height: 1.45;
          font-weight: 400;
        }

        .website-settings-notice {
          margin: 14px 18px 0;
          padding: 11px 13px;
          border: 1px solid #d8dce2;
          border-radius: 3px;
          background: #fafafa;
          color: #4b515a;
          font-size: 12px;
          line-height: 1.5;
          font-weight: 400;
        }

        .website-settings-notice strong {
          font-weight: 700;
          color: #26292e;
        }

        .website-settings-rows {
          padding: 0 18px 6px;
        }

        /* WISDOM SETTINGS ALIGNMENT LEFT V1 */
        .website-settings-row {
          display: grid;
          grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
          gap: 24px;
          align-items: center;
          min-height: 92px;
          padding: 17px 2px;
          border-bottom: 1px solid #eceef1;
        }

        .website-settings-row:last-child {
          border-bottom: 0;
        }

        .website-settings-row.textarea-row,
        .website-settings-row.image-row {
          align-items: flex-start;
        }

        .website-settings-row-copy {
          min-width: 0;
          padding-top: 1px;
        }

        .website-settings-label {
          display: block;
          margin: 0;
          color: #202328;
          font-size: 13.5px;
          line-height: 1.35;
          font-weight: 720;
        }

        .website-settings-hint {
          max-width: 470px;
          margin: 5px 0 0;
          color: #757c86;
          font-size: 11.5px;
          line-height: 1.45;
          font-weight: 400;
        }

        .website-settings-control {
          min-width: 0;
        }

        .website-settings-control.wide {
          max-width: 600px;
        }

        .website-settings-control.phone {
          max-width: 230px;
        }

        .website-settings-control.email {
          max-width: 430px;
        }

        .website-settings-control.accountName {
          max-width: 370px;
        }

        .website-settings-control.accountNumber {
          max-width: 290px;
        }

        .website-settings-control.message {
          max-width: 720px;
        }

        .website-settings-control.number {
          max-width: 190px;
        }

        .website-settings-input,
        .website-settings-textarea {
          width: 100%;
          border: 1px solid #cfd4da;
          border-radius: 3px;
          background: #ffffff;
          color: #272b31;
          outline: none;
          font-size: 13px;
          font-weight: 400;
          transition:
            border-color 150ms ease,
            box-shadow 150ms ease;
        }

        .website-settings-input {
          height: 40px;
          padding: 0 12px;
        }

        .website-settings-textarea {
          min-height: 92px;
          padding: 10px 12px;
          resize: vertical;
          font-family: inherit;
          line-height: 1.55;
        }

        .website-settings-input:focus,
        .website-settings-textarea:focus {
          border-color: #111111;
          box-shadow: 0 0 0 2px rgba(17, 17, 17, 0.07);
        }

        .website-settings-toggle {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
        }

        .website-settings-switch {
          width: 42px;
          height: 23px;
          border: 1px solid #bfc4cb;
          border-radius: 12px;
          background: #d7dae0;
          position: relative;
          flex: 0 0 auto;
        }

        .website-settings-switch.active {
          border-color: #18181b;
          background: #18181b;
        }

        .website-settings-switch-thumb {
          width: 17px;
          height: 17px;
          border-radius: 50%;
          background: #ffffff;
          position: absolute;
          top: 2px;
          left: 3px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
          transition: left 150ms ease;
        }

        .website-settings-switch.active .website-settings-switch-thumb {
          left: 20px;
        }

        .website-settings-toggle-status {
          color: #6c737d;
          font-size: 12px;
          font-weight: 500;
        }

        .website-settings-toggle-status.enabled {
          color: #202328;
          font-weight: 650;
        }

        .website-settings-number {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .website-settings-number .website-settings-input {
          width: 140px;
        }

        .website-settings-suffix {
          color: #676e78;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
        }

        .website-settings-logo {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .website-settings-logo-preview {
          width: 72px;
          height: 60px;
          padding: 6px;
          border: 1px solid #d9dde2;
          border-radius: 3px;
          background: #fafafa;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .website-settings-logo-preview img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .website-settings-file-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .website-settings-file-button {
          min-height: 36px;
          padding: 0 12px;
          border: 1px solid #cfd4da;
          border-radius: 3px;
          background: #ffffff;
          color: #282c32;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 12px;
          font-weight: 650;
        }

        .website-settings-file-button input {
          display: none;
        }

        .website-settings-file-name {
          max-width: 270px;
          overflow: hidden;
          color: #777e88;
          font-size: 11px;
          font-weight: 400;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .website-settings-file-note {
          margin-top: 5px;
          color: #8a919b;
          font-size: 10.5px;
          font-weight: 400;
        }

        .website-settings-state {
          min-height: 300px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #71717a;
          font-size: 13px;
        }

        .website-settings-error {
          max-width: 620px;
          padding: 18px;
          border: 1px solid #e1e4e8;
          border-radius: 4px;
          background: #ffffff;
        }

        @media (max-width: 900px) {
          .website-settings-tabs {
            grid-template-columns: repeat(5, minmax(155px, 1fr));
            overflow-x: auto;
          }

          .website-settings-row {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .website-settings-row-copy {
            padding-top: 0;
          }
        }

        @media (max-width: 620px) {
          .website-settings-header {
            flex-direction: column;
          }

          .website-settings-primary {
            width: 100%;
          }
        }
      `}</style>

      <header className="website-settings-header">
        <div>
          <h1 className="website-settings-title">Website Settings</h1>
          <p className="website-settings-subtitle">
            Configure customer website details, payments, email notifications,
            policies, and standard truck capacity.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasDirty}
          className={`website-settings-primary ${
            !hasDirty && !saving ? "saved" : ""
          }`}
        >
          {saving ? "Saving..." : hasDirty ? "Save Changes" : "✓ Saved"}
        </button>
      </header>

      {hasDirty && (
        <div className="website-settings-unsaved">
          You have unsaved changes. <strong>Save Changes</strong> to apply them.
        </div>
      )}

      <nav className="website-settings-tabs" aria-label="Website settings">
        {Object.entries(SECTION_META).map(([key, meta]) => (
          <button
            type="button"
            key={key}
            onClick={() => setActiveTab(key)}
            className={`website-settings-tab ${
              activeTab === key ? "active" : ""
            }`}
          >
            <span className="website-settings-tab-icon" aria-hidden="true">
              {meta.icon}
            </span>
            {meta.label}
          </button>
        ))}
      </nav>

      <section className="website-settings-panel">
        <div className="website-settings-panel-head">
          <h2>{activeMeta.label}</h2>
          <p>{activeMeta.description}</p>
        </div>

        {activeTab === "delivery" && (
          <div className="website-settings-notice">
            <strong>Use actual usable cargo measurements.</strong> The system
            compares final furniture width, height, and length with these
            limits. It does not calculate a larger truck fee.
          </div>
        )}

        <div className="website-settings-rows">
          {activeKeys.map((key) => {
            const meta = KEY_META[key];
            if (!meta) return null;

            return (
              <SettingRow
                key={key}
                keyName={key}
                meta={meta}
                value={settings[key]}
                preview={preview}
                logoFile={logoFile}
                onChange={(value) => set(key, value)}
                onLogoChange={(file) => {
                  setLogoFile(file);
                  setPreview(URL.createObjectURL(file));
                  setDirty((current) => ({
                    ...current,
                    site_logo: "updated",
                  }));
                }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SettingRow({
  keyName,
  meta,
  value,
  preview,
  logoFile,
  onChange,
  onLogoChange,
}) {
  const isTrue = (input) => input === "true" || input === true || input === 1;
  const rowClass = [
    "website-settings-row",
    meta.type === "textarea" ? "textarea-row" : "",
    meta.type === "image" ? "image-row" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      <div className="website-settings-row-copy">
        <label
          className="website-settings-label"
          htmlFor={`setting-${keyName}`}
        >
          {meta.label}
        </label>
        <p className="website-settings-hint">{meta.hint}</p>
      </div>

      <div className={`website-settings-control ${meta.width || ""}`}>
        {meta.type === "toggle" && (
          <div
            className="website-settings-toggle"
            role="switch"
            aria-checked={isTrue(value)}
            tabIndex={0}
            onClick={() => onChange(isTrue(value) ? "false" : "true")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onChange(isTrue(value) ? "false" : "true");
              }
            }}
          >
            <span
              className={`website-settings-switch ${
                isTrue(value) ? "active" : ""
              }`}
            >
              <span className="website-settings-switch-thumb" />
            </span>
            <span
              className={`website-settings-toggle-status ${
                isTrue(value) ? "enabled" : ""
              }`}
            >
              {isTrue(value) ? "Enabled" : "Disabled"}
            </span>
          </div>
        )}

        {meta.type === "text" && (
          <input
            id={`setting-${keyName}`}
            type="text"
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
            className="website-settings-input"
            placeholder={`Enter ${meta.label.toLowerCase()}...`}
          />
        )}

        {meta.type === "number" && (
          <div className="website-settings-number">
            <input
              id={`setting-${keyName}`}
              type="number"
              min={meta.min}
              max={meta.max}
              step={meta.step}
              value={value || ""}
              onChange={(event) => onChange(event.target.value)}
              className="website-settings-input"
            />
            <span className="website-settings-suffix">{meta.suffix || ""}</span>
          </div>
        )}

        {meta.type === "textarea" && (
          <textarea
            id={`setting-${keyName}`}
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
            rows={keyName === "checkout_note" ? 4 : 3}
            className="website-settings-textarea"
            placeholder={`Enter ${meta.label.toLowerCase()}...`}
          />
        )}

        {meta.type === "image" && (
          <div className="website-settings-logo">
            <div className="website-settings-logo-preview">
              {preview ? (
                <img src={preview} alt="Current site logo" />
              ) : (
                <span aria-hidden="true">🪵</span>
              )}
            </div>

            <div>
              <div className="website-settings-file-wrap">
                <label className="website-settings-file-button">
                  Choose Logo
                  <input
                    id={`setting-${keyName}`}
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      if (event.target.files[0]) {
                        onLogoChange(event.target.files[0]);
                      }
                    }}
                  />
                </label>
                <span className="website-settings-file-name">
                  {logoFile?.name || "Current logo"}
                </span>
              </div>
              <div className="website-settings-file-note">
                PNG or JPG, maximum 5 MB
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
