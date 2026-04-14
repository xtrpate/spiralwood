// src/pages/website/StaticPagesPage.jsx – Static Page Content (About Us, Contact, FAQ)
import React, { useEffect, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";

const PAGE_META = {
  about_us: {
    label: "About Us",
    icon: "🏢",
    hint: "Tell customers about Spiral Wood Services — history, mission, and what makes you unique.",
    preview: "Shown on the /about page of the customer website.",
  },
  contact: {
    label: "Contact Us",
    icon: "📞",
    hint: "Provide contact details, business hours, and how customers can reach you.",
    preview: "Shown on the /contact page of the customer website.",
  },
  faq: {
    label: "FAQ Intro",
    icon: "❓",
    hint: "Introductory text shown above the FAQ list. Individual Q&As are managed in the FAQ section.",
    preview: "Shown at the top of the /faq page.",
  },
};

export default function StaticPagesPage() {
  const [pages, setPages] = useState({}); // slug → page object
  const [active, setActive] = useState("about_us");
  const [form, setForm] = useState({
    title: "",
    content: "",
    is_visible: true,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPrev, setShowPrev] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/website/pages");
      const map = {};
      data.forEach((p) => {
        map[p.slug] = p;
      });
      setPages(map);
      // Load first tab
      const first = map["about_us"];
      if (first)
        setForm({
          title: first.title,
          content: first.content,
          is_visible: !!first.is_visible,
        });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Switch tabs – warn about unsaved changes
  const switchTab = (slug) => {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?"))
      return;
    setActive(slug);
    const p = pages[slug];
    if (p)
      setForm({
        title: p.title,
        content: p.content,
        is_visible: !!p.is_visible,
      });
    setDirty(false);
    setShowPrev(false);
  };

  const setF = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/website/pages/${active}`, form);
      toast.success(`${PAGE_META[active]?.label} page saved.`);
      // Update local cache
      setPages((p) => ({ ...p, [active]: { ...p[active], ...form } }));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const meta = PAGE_META[active];

  if (loading) return <div style={center}>Loading pages...</div>;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={pageTitle}>Page Content</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Edit the content of static pages shown on the customer website.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowPrev((p) => !p)}
            style={{
              ...btnGhost,
              background: showPrev ? "#dbeafe" : "#f1f5f9",
              color: showPrev ? "#1e40af" : "#374151",
            }}
          >
            {showPrev ? "📝 Edit Mode" : "👁 Preview"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{ ...btnPrimary, opacity: !dirty ? 0.5 : 1 }}
          >
            {saving ? "Saving..." : dirty ? "💾 Save Page" : "✓ Saved"}
          </button>
        </div>
      </div>

      {dirty && (
        <div
          style={{
            background: "#fef9c3",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "#92400e",
          }}
        >
          ⚠️ You have unsaved changes on the <strong>{meta?.label}</strong>{" "}
          page.
        </div>
      )}

      <div
        style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}
      >
        {/* ── Page Selector ──────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(PAGE_META).map(([slug, m]) => {
            const page = pages[slug];
            const isActive = slug === active;
            return (
              <button
                key={slug}
                onClick={() => switchTab(slug)}
                style={{
                  padding: "14px 16px",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  background: isActive ? "#1e40af" : "#fff",
                  color: isActive ? "#fff" : "#374151",
                  boxShadow: "0 1px 6px rgba(0,0,0,.08)",
                  borderLeft: isActive
                    ? "4px solid #60a5fa"
                    : "4px solid transparent",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>
                  {page?.is_visible ? "👁 Visible" : "🙈 Hidden"}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Editor / Preview ───────────────────────────────────── */}
        <div style={card}>
          {/* Card header */}
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#1e2a38",
                }}
              >
                {meta?.icon} {meta?.label}
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
                {meta?.preview}
              </p>
            </div>
            {/* Visibility toggle */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12, color: "#64748b" }}>Visible</span>
              <div
                onClick={() => setF("is_visible", !form.is_visible)}
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  cursor: "pointer",
                  background: form.is_visible ? "#1e40af" : "#d1d5db",
                  position: "relative",
                  transition: "background .2s",
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: 3,
                    left: form.is_visible ? 21 : 3,
                    transition: "left .2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                  }}
                />
              </div>
            </label>
          </div>

          <div style={{ padding: 24 }}>
            {!showPrev ? (
              /* ── Edit mode ────────────────────────────────────── */
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelSm}>Page Title</label>
                  <input
                    value={form.title || ""}
                    onChange={(e) => setF("title", e.target.value)}
                    style={inputFull}
                    placeholder={`${meta?.label} page title`}
                  />
                </div>
                <div>
                  <label style={labelSm}>
                    Page Content
                    <span
                      style={{
                        fontWeight: 400,
                        color: "#94a3b8",
                        marginLeft: 6,
                        fontSize: 11,
                      }}
                    >
                      Supports plain text. Use double line breaks for
                      paragraphs.
                    </span>
                  </label>
                  <textarea
                    value={form.content || ""}
                    onChange={(e) => setF("content", e.target.value)}
                    rows={18}
                    style={{
                      ...inputFull,
                      resize: "vertical",
                      lineHeight: 1.7,
                      fontFamily: "inherit",
                    }}
                    placeholder={`Write the content for the ${meta?.label} page here...`}
                  />
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                    {(form.content || "").length} characters &nbsp;·&nbsp;{" "}
                    {(form.content || "").split("\n").filter(Boolean).length}{" "}
                    lines
                  </p>
                </div>
              </>
            ) : (
              /* ── Preview mode ─────────────────────────────────── */
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 10,
                  padding: 24,
                  minHeight: 400,
                }}
              >
                <div
                  style={{
                    marginBottom: 6,
                    fontSize: 11,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Preview — {meta?.label} Page
                </div>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#1e2a38",
                    margin: "0 0 16px",
                  }}
                >
                  {form.title || meta?.label}
                </h2>
                <div
                  style={{
                    fontSize: 14,
                    color: "#374151",
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {form.content || (
                    <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                      No content yet.
                    </span>
                  )}
                </div>
                {!form.is_visible && (
                  <div
                    style={{
                      marginTop: 20,
                      padding: "10px 14px",
                      background: "#fee2e2",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#991b1b",
                    }}
                  >
                    ⚠️ This page is currently <strong>hidden</strong> from the
                    website.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageTitle = {
  fontSize: 22,
  fontWeight: 700,
  color: "#1e2a38",
  margin: 0,
};
const card = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,.08)",
  overflow: "hidden",
};
const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 300,
  color: "#64748b",
};
const labelSm = {
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  display: "block",
  marginBottom: 6,
};
const inputFull = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};
const btnPrimary = {
  padding: "8px 20px",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const btnGhost = {
  padding: "8px 16px",
  background: "#f1f5f9",
  color: "#374151",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};
