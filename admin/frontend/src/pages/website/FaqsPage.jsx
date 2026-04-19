// src/pages/website/FaqsPage.jsx – FAQ Management (Admin)
import React, { useEffect, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";

const BLANK = { question: "", answer: "", sort_order: 0, is_visible: true };

export default function FaqsPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoad] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit'
  const [form, setForm] = useState(BLANK);
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoad(true);
    try {
      const { data } = await api.get("/website/faqs");
      setFaqs(data);
    } finally {
      setLoad(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm({ ...BLANK, sort_order: faqs.length + 1 });
    setTarget(null);
    setModal("add");
  };

  const openEdit = (faq) => {
    setForm({
      question: faq.question,
      answer: faq.answer,
      sort_order: faq.sort_order,
      is_visible: !!faq.is_visible,
    });
    setTarget(faq);
    setModal("edit");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "add") {
        await api.post("/website/faqs", form);
        toast.success("FAQ added.");
      } else {
        await api.put(`/website/faqs/${target.id}`, form);
        toast.success("FAQ updated.");
      }
      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, question) => {
    if (!window.confirm(`Delete this FAQ?\n"${question}"`)) return;
    await api.delete(`/website/faqs/${id}`);
    toast.success("FAQ deleted.");
    load();
  };

  const toggleVisibility = async (faq) => {
    await api.put(`/website/faqs/${faq.id}`, {
      ...faq,
      is_visible: !faq.is_visible,
    });
    toast.success(
      faq.is_visible ? "FAQ hidden from website." : "FAQ shown on website.",
    );
    load();
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const visible = faqs.filter((f) => f.is_visible).length;
  const hidden = faqs.filter((f) => !f.is_visible).length;

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
          <h1 style={pageTitle}>FAQ Management</h1>
          <p style={{ fontSize: 13, color: "#52525b", margin: "4px 0 0" }}>
            Manage frequently asked questions displayed on the customer website.
          </p>
        </div>
        <button
          onClick={openAdd}
          style={btnPrimary}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#3f3f46")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#18181b")}
        >
          + Add FAQ
        </button>
      </div>

      {/* ── Summary ─────────────────────────────────────────────── */}
      <div
        style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}
      >
        {[
          { label: "Total FAQs", value: faqs.length, color: "#18181b" },
          { label: "Visible", value: visible, color: "#18181b" },
          { label: "Hidden", value: hidden, color: "#52525b" },
        ].map((chip) => (
          <div
            key={chip.label}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "16px 20px",
              border: "1px solid #e4e4e7",
              borderLeft: `4px solid ${chip.color}`,
              boxShadow: "0 1px 2px rgba(0,0,0,.02)",
              minWidth: 140,
              flex: 1,
            }}
          >
            <p
              style={{
                fontSize: 10,
                color: "#71717a",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "1px",
                fontWeight: 800,
              }}
            >
              {chip.label}
            </p>
            <p
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0a0a0a",
                margin: "6px 0 0",
                letterSpacing: "-0.02em",
              }}
            >
              {chip.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── FAQ List ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={center}>Loading FAQs...</div>
      ) : faqs.length === 0 ? (
        <div
          style={{
            ...card,
            padding: 60,
            textAlign: "center",
            color: "#71717a",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          No FAQs yet. Click <strong>+ Add FAQ</strong> to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {faqs.map((faq) => (
            <div
              key={faq.id}
              style={{
                ...card,
                padding: "20px 24px",
                border: faq.is_visible
                  ? "1px solid #e4e4e7"
                  : "1px dashed #d4d4d8",
                background: faq.is_visible ? "#ffffff" : "#fafafa",
                opacity: faq.is_visible ? 1 : 0.65,
                transition: "all 0.2s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#71717a",
                        width: 24,
                      }}
                    >
                      #{faq.sort_order}
                    </span>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#0a0a0a",
                      }}
                    >
                      {faq.question}
                    </span>
                    {!faq.is_visible && (
                      <span
                        style={{
                          fontSize: 10,
                          background: "#f4f4f5",
                          border: "1px solid #e4e4e7",
                          color: "#52525b",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontWeight: 700,
                        }}
                      >
                        Hidden
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#52525b",
                      margin: 0,
                      lineHeight: 1.6,
                      paddingLeft: 34,
                    }}
                  >
                    {faq.answer}
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => toggleVisibility(faq)}
                    title={
                      faq.is_visible ? "Hide from website" : "Show on website"
                    }
                    style={{
                      ...btnIcon,
                      background: faq.is_visible ? "#f4f4f5" : "#18181b",
                      color: faq.is_visible ? "#18181b" : "#ffffff",
                      border: faq.is_visible
                        ? "1px solid #e4e4e7"
                        : "1px solid #18181b",
                    }}
                  >
                    {faq.is_visible ? "👁 Visible" : "🙈 Hidden"}
                  </button>
                  <button
                    onClick={() => openEdit(faq)}
                    style={{
                      ...btnIcon,
                      background: "#f4f4f5",
                      color: "#18181b",
                      border: "1px solid #e4e4e7",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(faq.id, faq.question)}
                    style={{
                      ...btnIcon,
                      background: "#fef2f2",
                      color: "#991b1b",
                      border: "1px solid #fecaca",
                    }}
                  >
                    Del
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────── */}
      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3
              style={{
                margin: "0 0 24px",
                fontSize: 20,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.01em",
              }}
            >
              {modal === "add" ? "Add New FAQ" : "Edit FAQ"}
            </h3>
            <form onSubmit={handleSave}>
              {/* Question */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelSm}>Question *</label>
                <input
                  required
                  value={form.question}
                  onChange={(e) => setF("question", e.target.value)}
                  style={inputFull}
                  placeholder="e.g. How long does delivery take?"
                />
              </div>

              {/* Answer */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelSm}>Answer *</label>
                <textarea
                  required
                  value={form.answer}
                  onChange={(e) => setF("answer", e.target.value)}
                  rows={5}
                  style={{
                    ...inputFull,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  placeholder="Provide a clear and helpful answer..."
                />
              </div>

              {/* Sort order + visibility */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label style={labelSm}>Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={form.sort_order}
                    onChange={(e) =>
                      setF("sort_order", parseInt(e.target.value) || 1)
                    }
                    style={inputFull}
                  />
                  <p
                    style={{
                      fontSize: 11,
                      color: "#71717a",
                      margin: "6px 0 0",
                      fontWeight: 500,
                    }}
                  >
                    Lower number = shown first
                  </p>
                </div>
                <div>
                  <label style={labelSm}>Visibility</label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                      marginTop: 10,
                    }}
                  >
                    <div
                      onClick={() => setF("is_visible", !form.is_visible)}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        cursor: "pointer",
                        background: form.is_visible ? "#18181b" : "#d4d4d8",
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
                          left: form.is_visible ? 23 : 3,
                          transition: "left .2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        color: form.is_visible ? "#18181b" : "#71717a",
                        fontWeight: 600,
                      }}
                    >
                      {form.is_visible ? "Visible on website" : "Hidden"}
                    </span>
                  </label>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 28,
                }}
              >
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving
                    ? "Saving..."
                    : modal === "add"
                      ? "Add FAQ"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
};
const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 200,
  color: "#71717a",
  fontWeight: 600,
  fontSize: 14,
};
const labelSm = {
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  display: "block",
  marginBottom: 8,
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
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};
const modalBox = {
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  width: 560,
  maxWidth: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  border: "1px solid #e4e4e7",
  boxShadow: "0 25px 60px rgba(0,0,0,.15)",
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
const btnGhost = {
  padding: "10px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};
const btnIcon = {
  padding: "6px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};
