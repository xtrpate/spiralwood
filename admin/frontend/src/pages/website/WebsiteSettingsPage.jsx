// src/pages/website/WebsiteSettingsPage.jsx – Website Maintenance (Admin)
import React, { useEffect, useState } from "react";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

const DELIVERY_LIMIT_KEYS = [
  "standard_truck_limit_width_mm",
  "standard_truck_limit_height_mm",
  "standard_truck_limit_depth_mm",
];

const SECTION_META = {
  display: { label: "🖼️ Display & Branding", icon: "🖼️" },
  payment: { label: "💳 Payment Settings", icon: "💳" },
  email: { label: "📧 Email & Notifications", icon: "📧" },
  policy: { label: "📋 Business Policy", icon: "📋" },
  delivery: { label: "🚚 Delivery Capacity", icon: "🚚" },
};

// Human-readable labels for each key
const KEY_META = {
  // display
  site_logo: {
    label: "Site Logo",
    type: "image",
    hint: "PNG or JPG recommended. Shown in the website header.",
  },
  site_name: {
    label: "Business Name",
    type: "text",
    hint: "Displayed in the browser tab and emails.",
  },
  show_faq_section: {
    label: "Show FAQ Section",
    type: "toggle",
    hint: "Toggle visibility of the FAQ section on the website.",
  },
  show_about_section: {
    label: "Show About Section",
    type: "toggle",
    hint: "Toggle visibility of the About Us section.",
  },
  show_contact_section: {
    label: "Show Contact Section",
    type: "toggle",
    hint: "Toggle visibility of the Contact Us section.",
  },
  business_address: {
    label: "Business Address",
    type: "text",
    hint: "Shown on the Contact page.",
  },
  business_phone: {
    label: "Business Phone",
    type: "text",
    hint: "Shown on the Contact page and receipts.",
    pattern: /^09\d{9}$/,
    patternMessage:
      "Business phone must be exactly 11 digits and start with '09'.",
  },
  business_email: {
    label: "Business Email",
    type: "text",
    hint: "Displayed on the Contact page and used as your public email.",
  },
  social_facebook: {
    label: "Facebook Page URL",
    type: "text",
    hint: "Link to your official Facebook page.",
  },
  operating_hours: {
    label: "Operating Hours",
    type: "textarea",
    hint: "Displayed on the website footer. Use line breaks for multiple days.",
  },

  // payment
  cod_enabled: {
    label: "Cash on Delivery (COD)",
    type: "toggle",
    hint: "Allow customers to select COD at checkout.",
  },
  cop_enabled: {
    label: "Cash on Pick-up (COP)",
    type: "toggle",
    hint: "Allow customers to select Cash on Pick-up.",
  },
  gcash_enabled: {
    label: "GCash Payments",
    type: "toggle",
    hint: "Enable GCash as a payment option.",
  },
  bank_transfer_enabled: {
    label: "Bank Transfer",
    type: "toggle",
    hint: "Enable Bank Transfer as a payment option.",
  },
  gcash_number: {
    label: "GCash Number",
    type: "text",
    hint: "Displayed to customers during GCash checkout.",
    pattern: /^09\d{9}$/,
    patternMessage:
      "GCash number must be exactly 11 digits and start with '09'.",
  },
  bank_account_name: {
    label: "Bank Account Name",
    type: "text",
    hint: "Account name shown during bank transfer checkout.",
  },
  bank_account_number: {
    label: "Bank Account Number",
    type: "text",
    hint: "Account number shown during bank transfer checkout.",
  },
  paymongo_public_key: {
    label: "PayMongo Public Key",
    type: "text",
    hint: "Used for frontend payment tokenization (usually starts with pk_).",
  },
  paymongo_secret_key: {
    label: "PayMongo Secret Key",
    type: "password",
    hint: "Used for backend API processing (starts with sk_). Keep this secure.",
  },

  // email
  email_footer: {
    label: "Email Footer Text",
    type: "textarea",
    hint: "Appended to all outgoing system emails.",
  },
  checkout_note: {
    label: "Checkout Note",
    type: "textarea",
    hint: "Message shown to customers during checkout.",
  },

  // policy
  warranty_period_days: {
    label: "Warranty Period (days)",
    type: "number",
    suffix: "days",
    min: 1,
    step: 1,
    hint: "Default: 365 days (1 year) from order completion.",
  },
  cancellation_fee_pct: {
    label: "Cancellation Fee (%)",
    type: "number",
    suffix: "%",
    min: 0,
    max: 100,
    step: 0.01,
    hint: "Percentage fee applied on custom order cancellations after down payment.",
  },

  // delivery capacity
  standard_truck_limit_width_mm: {
    label: "Standard Truck Internal Width",
    type: "number",
    suffix: "mm",
    min: 1,
    max: 20000,
    step: 1,
    hint: "Enter the actual usable internal cargo width. Do not use the truck's exterior width.",
  },
  standard_truck_limit_height_mm: {
    label: "Standard Truck Internal Height",
    type: "number",
    suffix: "mm",
    min: 1,
    max: 20000,
    step: 1,
    hint: "Enter the smaller of the usable internal cargo height or loading-door opening.",
  },
  standard_truck_limit_depth_mm: {
    label: "Standard Truck Internal Length / Depth",
    type: "number",
    suffix: "mm",
    min: 1,
    max: 20000,
    step: 1,
    hint: "Enter the usable cargo length from the loading opening to the front wall.",
  },
};

export default function WebsiteSettingsPage() {
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

        // Flatten grouped object → flat key:value
        const flat = {};
        Object.values(data || {}).forEach((group) => {
          if (group && typeof group === "object") Object.assign(flat, group);
        });

        setSettings(flat);
        setPreview(flat.site_logo ? buildAssetUrl(flat.site_logo) : "");
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
    // 1. Validate Delivery Limits (Existing Logic)
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
          "Enter valid internal truck width, height, and depth limits in millimeters.",
        );
        return false;
      }
    }

    // 2. Validate Regex Patterns for ALL modified fields
    for (const key of Object.keys(dirty)) {
      const meta = KEY_META[key];
      const value = settings[key];

      // If the field has a regex pattern and isn't empty, test it
      if (meta?.pattern && value) {
        if (!meta.pattern.test(value)) {
          // Find which tab this field belongs to so we can auto-switch to it
          const targetTab = Object.entries({
            display: [
              "site_logo",
              "site_name",
              "show_faq_section",
              "show_about_section",
              "show_contact_section",
              "business_address",
              "business_phone",
              "business_email",
              "social_facebook",
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
              "paymongo_public_key",
              "paymongo_secret_key",
            ],
            email: ["email_footer", "checkout_note"],
            policy: ["warranty_period_days", "cancellation_fee_pct"],
            delivery: DELIVERY_LIMIT_KEYS,
          }).find(([, keys]) => keys.includes(key))?.[0];

          if (targetTab) setActiveTab(targetTab);

          toast.error(
            meta.patternMessage || `Invalid format for ${meta.label}`,
          );
          return false;
        }
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateSettings()) return;

    setSaving(true);
    try {
      const fd = new FormData();

      // Send only changed keys
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

  // Intercept browser refresh/close if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = ""; // This triggers the browser's native warning prompt
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDirty]);

  if (loading) return <div style={center}>Loading settings...</div>;

  if (loadError) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>
          Unable to load Site Settings
        </h2>
        <p style={{ margin: "8px 0 0", color: "#71717a", fontSize: 13 }}>
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ ...btnPrimary, marginTop: 16 }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Keys that belong to this tab's group
  const tabKeys = Object.entries(KEY_META).filter(([key]) => {
    const group = Object.entries({
      display: [
        "site_logo",
        "site_name",
        "show_faq_section",
        "show_about_section",
        "show_contact_section",
        "business_address",
        "business_phone",
        "business_email",
        "social_facebook",
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
      email: ["email_footer", "checkout_note"],
      policy: ["warranty_period_days", "cancellation_fee_pct"],
      delivery: DELIVERY_LIMIT_KEYS,
    }).find(([, keys]) => keys.includes(key));

    return group?.[0] === activeTab;
  });

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1 style={pageTitle}>Website Maintenance</h1>
          <p style={{ fontSize: 13, color: "#52525b", margin: "4px 0 0" }}>
            Configure the customer-facing website settings, payment options,
            business policies, and standard delivery-truck capacity.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !hasDirty}
          style={{
            ...btnPrimary,
            opacity: !hasDirty && !saving ? 0.5 : 1,
            cursor: !hasDirty && !saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving..." : hasDirty ? "💾 Save Changes" : "✓ Saved"}
        </button>
      </div>

      {hasDirty && (
        <div
          style={{
            background: "#fefce8",
            border: "1px solid #fde047",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 600,
            color: "#a16207",
          }}
        >
          ⚠️ You have unsaved changes. Click <strong>Save Changes</strong> to
          apply them.
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid #e4e4e7",
          marginBottom: 24,
          overflowX: "auto",
        }}
      >
        {Object.entries(SECTION_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.02em",
              color: activeTab === key ? "#18181b" : "#71717a",
              borderBottom:
                activeTab === key
                  ? "2px solid #18181b"
                  : "2px solid transparent",
              marginBottom: -2,
              whiteSpace: "nowrap",
              transition: "all 0.2s ease",
            }}
          >
            {meta.label}
          </button>
        ))}
      </div>

      {activeTab === "delivery" && (
        <div style={deliveryNotice}>
          <strong>Use actual usable cargo measurements.</strong>
          <span>
            The system compares the customer’s final furniture width, height,
            and depth against these limits. It does not calculate or guess the
            final larger-truck fee.
          </span>
        </div>
      )}

      {/* ── Settings Form ─────────────────────────────────────────── */}
      <div style={card}>
        {tabKeys.map(([key, meta]) => (
          <SettingRow
            key={key}
            keyName={key}
            meta={meta}
            value={settings[key]}
            preview={preview}
            isDirty={!!dirty[key] || (key === "site_logo" && logoFile)}
            onChange={(val) => set(key, val)}
            onLogoChange={(file) => {
              setLogoFile(file);
              setPreview(URL.createObjectURL(file));
              setDirty((current) => ({
                ...current,
                site_logo: "updated",
              }));
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Individual Setting Row ────────────────────────────────────────────────────
function SettingRow({
  keyName,
  meta,
  value,
  preview,
  isDirty,
  onChange,
  onLogoChange,
}) {
  const isTrue = (input) => input === "true" || input === true || input === 1;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(240px, 300px) 1fr",
        gap: 20,
        padding: "20px 24px",
        borderBottom: "1px solid #f4f4f5",
        background: isDirty ? "#fefce8" : "transparent",
        alignItems: "start",
      }}
    >
      {/* Label + hint */}
      <div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 13,
            color: "#0a0a0a",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {meta.label}

          {isDirty && (
            <span
              style={{
                fontSize: 10,
                background: "#fde047",
                color: "#854d0e",
                padding: "2px 8px",
                borderRadius: 12,
              }}
            >
              Modified
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#71717a",
            marginTop: 6,
            lineHeight: 1.5,
            fontWeight: 500,
          }}
        >
          {meta.hint}
        </div>
      </div>

      {/* Input */}
      <div>
        {meta.type === "toggle" && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            <div
              onClick={() => onChange(isTrue(value) ? "false" : "true")}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                cursor: "pointer",
                background: isTrue(value) ? "#18181b" : "#d4d4d8",
                position: "relative",
                transition: "background .2s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 3,
                  left: isTrue(value) ? 23 : 3,
                  transition: "left .2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                }}
              />
            </div>

            <span
              style={{
                fontSize: 13,
                color: isTrue(value) ? "#18181b" : "#71717a",
                fontWeight: 700,
              }}
            >
              {isTrue(value) ? "Enabled" : "Disabled"}
            </span>
          </label>
        )}

        {(meta.type === "text" || meta.type === "password") && (
          <input
            type={meta.type}
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
            style={inputFull}
            placeholder={`Enter ${meta.label.toLowerCase()}...`}
          />
        )}

        {meta.type === "number" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number"
              min={meta.min}
              max={meta.max}
              step={meta.step}
              value={value || ""}
              onChange={(event) => onChange(event.target.value)}
              style={{ ...inputFull, width: 160 }}
            />

            <span
              style={{
                fontSize: 12,
                color: "#71717a",
                fontWeight: 600,
              }}
            >
              {meta.suffix || ""}
            </span>
          </div>
        )}

        {meta.type === "textarea" && (
          <textarea
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
            rows={4}
            style={{
              ...inputFull,
              resize: "vertical",
              fontFamily: "inherit",
            }}
            placeholder={`Enter ${meta.label.toLowerCase()}...`}
          />
        )}

        {meta.type === "image" && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {preview ? (
              <img
                src={preview}
                alt="logo"
                style={{
                  height: 64,
                  maxWidth: 180,
                  objectFit: "contain",
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  padding: 8,
                  background: "#fafafa",
                }}
              />
            ) : (
              <div
                style={{
                  width: 80,
                  height: 64,
                  background: "#f4f4f5",
                  border: "1px solid #e4e4e7",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                }}
              >
                🪵
              </div>
            )}

            <div>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  if (event.target.files[0]) {
                    onLogoChange(event.target.files[0]);
                  }
                }}
                style={{ fontSize: 13, color: "#52525b" }}
              />

              <p
                style={{
                  fontSize: 11,
                  color: "#71717a",
                  margin: "6px 0 0",
                  fontWeight: 500,
                }}
              >
                PNG or JPG, max 2MB
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageTitle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};

const card = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflow: "hidden",
};

const deliveryNotice = {
  display: "grid",
  gap: 4,
  marginBottom: 16,
  padding: "14px 16px",
  border: "1px solid #d4d4d8",
  borderRadius: 12,
  background: "#fafafa",
  color: "#3f3f46",
  fontSize: 12,
  lineHeight: 1.5,
};

const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 300,
  color: "#71717a",
  fontSize: 14,
  fontWeight: 600,
};

const inputFull = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  boxSizing: "border-box",
  outline: "none",
};

const btnPrimary = {
  padding: "10px 20px",
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};
