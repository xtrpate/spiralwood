// src/pages/website/WebsiteSettingsPage.jsx – Website Maintenance (Admin)
import React, { useEffect, useState } from "react";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

const SECTION_META = {
  display: { label: "🖼️ Display & Branding", icon: "🖼️" },
  payment: { label: "💳 Payment Settings", icon: "💳" },
  email: { label: "📧 Email & Notifications", icon: "📧" },
  policy: { label: "📋 Business Policy", icon: "📋" },
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
  business_address: {
    label: "Business Address",
    type: "text",
    hint: "Shown on the Contact page.",
  },
  business_phone: {
    label: "Business Phone",
    type: "text",
    hint: "Shown on the Contact page and receipts.",
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
    hint: "Default: 365 days (1 year) from order completion.",
  },
  cancellation_fee_pct: {
    label: "Cancellation Fee (%)",
    type: "number",
    hint: "Percentage fee applied on custom order cancellations after down payment.",
  },
};

export default function WebsiteSettingsPage() {
  const [settings, setSettings] = useState({});
  const [dirty, setDirty] = useState({}); // only changed keys
  const [logoFile, setLogoFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("display");

  useEffect(() => {
    api
      .get("/website/settings")
      .then(({ data }) => {
        // Flatten grouped object → flat key:value
        const flat = {};
        Object.values(data).forEach((group) => Object.assign(flat, group));
        setSettings(flat);
        if (flat.site_logo) setPreview(buildAssetUrl(flat.site_logo));
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (key, val) => {
    setSettings((s) => ({ ...s, [key]: val }));
    setDirty((d) => ({ ...d, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      // Send only changed keys
      Object.entries(dirty).forEach(([k, v]) => {
        if (k !== "site_logo") fd.append(k, v);
      });
      if (logoFile) fd.append("site_logo", logoFile);

      await api.put("/website/settings", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Settings saved.");
      setDirty({});
      setLogoFile(null);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={center}>Loading settings...</div>;

  // Keys that belong to this tab's group
  const tabKeys = Object.entries(KEY_META).filter(([key]) => {
    const group = Object.entries({
      display: [
        "site_logo",
        "site_name",
        "show_faq_section",
        "show_about_section",
        "business_address",
        "business_phone",
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
    }).find(([, keys]) => keys.includes(key));
    return group?.[0] === activeTab;
  });

  const hasDirty = Object.keys(dirty).length > 0 || logoFile !== null;

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
            Configure the customer-facing website settings, payment options, and
            business policies.
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
              setDirty((d) => ({ ...d, site_logo: "updated" }));
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
  const isTrue = (v) => v === "true" || v === true || v === 1;

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

        {meta.type === "text" && (
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            style={inputFull}
            placeholder={`Enter ${meta.label.toLowerCase()}...`}
          />
        )}

        {meta.type === "number" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number"
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              style={{ ...inputFull, width: 140 }}
            />
            <span style={{ fontSize: 12, color: "#71717a", fontWeight: 600 }}>
              {keyName === "warranty_period_days" ? "days" : "%"}
            </span>
          </div>
        )}

        {meta.type === "textarea" && (
          <textarea
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            style={{ ...inputFull, resize: "vertical", fontFamily: "inherit" }}
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
                onChange={(e) => {
                  if (e.target.files[0]) onLogoChange(e.target.files[0]);
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
