// src/pages/website/FaqsPage.jsx – FAQ Management (Admin)
import React, { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import api from "../../services/api";
import toast from "react-hot-toast";
import "./WebsiteContentPolish.css";

const BLANK = { question: "", answer: "", sort_order: 0, is_visible: true };

export default function FaqsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [faqs, setFaqs] = useState([]);
  const [loading, setLoad] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [faqPage, setFaqPage] = useState(null);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  const load = async () => {
    setLoad(true);
    try {
      const [faqResponse, pageResponse] = await Promise.all([
        api.get("/website/faqs/admin"),
        api.get("/website/pages/admin"),
      ]);

      setFaqs(Array.isArray(faqResponse.data) ? faqResponse.data : []);

      const pageRows = Array.isArray(pageResponse.data) ? pageResponse.data : [];
      setFaqPage(pageRows.find((page) => page.slug === "faq") || null);
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to load FAQ management.",
      );
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

  const setF = (key, value) => setForm((current) => ({
    ...current,
    [key]: value,
  }));

  const visible = faqs.filter((faq) => faq.is_visible).length;
  const hidden = faqs.filter((faq) => !faq.is_visible).length;
  const faqPageVisible =
    faqPage?.is_visible === true ||
    faqPage?.is_visible === 1 ||
    faqPage?.is_visible === "1";

  const toggleFaqPageVisibility = async () => {
    if (!faqPage) {
      toast.error("FAQ page settings are unavailable.");
      return;
    }

    const nextVisible = !faqPageVisible;
    setVisibilitySaving(true);

    try {
      await api.put("/website/pages/faq", {
        title: faqPage.title || "",
        content: faqPage.content || "",
        is_visible: nextVisible,
      });

      setFaqPage((current) => ({
        ...current,
        is_visible: nextVisible ? 1 : 0,
      }));

      toast.success(
        nextVisible
          ? "FAQ page shown on website."
          : "FAQ page hidden from website.",
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Unable to update FAQ page visibility.",
      );
    } finally {
      setVisibilitySaving(false);
    }
  };

  return (
    <div className="website-admin-page website-faq-page">
      <header className="website-page-header">
        <div>
          <h1 className="website-page-title">FAQ Management</h1>
          <p className="website-page-subtitle">
            Manage frequently asked questions displayed on the customer website.
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="website-btn website-btn-primary"
        >
          <Plus size={15} strokeWidth={2} />
          Add FAQ
        </button>
      </header>

      <section className="website-panel">
        <div className="website-panel-heading">
          <div>
            <h2>FAQ Page Visibility</h2>
            <p>
              Show or hide the FAQ page and its footer link. Individual FAQ
              visibility is managed separately below.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleFaqPageVisibility}
            disabled={!faqPage || visibilitySaving}
            className="website-switch-row"
          >
            <span
              className={`website-switch ${faqPageVisible ? "is-on" : ""}`}
              aria-hidden="true"
            >
              <span />
            </span>
            <span>
              {visibilitySaving
                ? "Saving..."
                : faqPageVisible
                  ? "Visible on site"
                  : "Hidden from site"}
            </span>
          </button>
        </div>
      </section>

      <section
        className="website-summary-grid website-summary-grid-3"
        aria-label="FAQ summary"
      >
        {[
          { label: "Total FAQs", value: faqs.length },
          { label: "Visible", value: visible },
          { label: "Hidden", value: hidden },
        ].map((item) => (
          <div className="website-summary-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="website-panel website-faq-panel">
        <div className="website-panel-heading">
          <div>
            <h2>FAQ List</h2>
            <p>Review questions, answers, visibility, and display order.</p>
          </div>
          {!loading && (
            <span className="website-panel-count">
              {faqs.length} {faqs.length === 1 ? "question" : "questions"}
            </span>
          )}
        </div>

        {loading ? (
          <div className="website-empty-state">Loading FAQs...</div>
        ) : faqs.length === 0 ? (
          <div className="website-empty-state">
            <strong>No FAQs yet</strong>
            <span>Add a question to start building the customer FAQ page.</span>
          </div>
        ) : (
          <div className="website-faq-list">
            {faqs.map((faq) => (
              <article
                key={faq.id}
                className={`website-faq-row ${
                  faq.is_visible ? "" : "is-hidden"
                }`}
              >
                <div className="website-faq-content">
                  <div className="website-faq-question-row">
                    <span className="website-faq-order">
                      #{faq.sort_order}
                    </span>
                    <h3>{faq.question}</h3>
                    {!faq.is_visible && (
                      <span className="website-state-badge">Hidden</span>
                    )}
                  </div>

                  <p className="website-faq-answer">{faq.answer}</p>
                </div>

                <div className="website-row-actions">
                  <button
                    type="button"
                    onClick={() => toggleVisibility(faq)}
                    title={
                      faq.is_visible
                        ? "Hide from website"
                        : "Show on website"
                    }
                    className={`website-btn website-btn-compact website-visibility-btn ${
                      faq.is_visible ? "is-visible" : "is-hidden"
                    }`}
                  >
                    {faq.is_visible ? (
                      <Eye size={14} strokeWidth={1.9} />
                    ) : (
                      <EyeOff size={14} strokeWidth={1.9} />
                    )}
                    {faq.is_visible ? "Visible" : "Hidden"}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEdit(faq)}
                    className="website-btn website-btn-compact website-btn-secondary"
                  >
                    <Pencil size={13} strokeWidth={1.9} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(faq.id, faq.question)}
                    className="website-btn website-btn-compact website-btn-danger"
                  >
                    <Trash2 size={13} strokeWidth={1.9} />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div className="website-modal-overlay">
          <div
            className="website-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="faq-modal-title"
          >
            <div className="website-modal-heading">
              <h2 id="faq-modal-title">
                {modal === "add" ? "Add FAQ" : "Edit FAQ"}
              </h2>
              <p>
                {modal === "add"
                  ? "Create a clear question and customer-friendly answer."
                  : "Update the question, answer, order, or visibility."}
              </p>
            </div>

            <form onSubmit={handleSave}>
              <div className="website-form-group">
                <label className="website-form-label" htmlFor="faq-question">
                  Question
                </label>
                <input
                  id="faq-question"
                  required
                  value={form.question}
                  onChange={(e) => setF("question", e.target.value)}
                  className="website-input"
                  placeholder="e.g. How long does delivery take?"
                />
              </div>

              <div className="website-form-group">
                <label className="website-form-label" htmlFor="faq-answer">
                  Answer
                </label>
                <textarea
                  id="faq-answer"
                  required
                  value={form.answer}
                  onChange={(e) => setF("answer", e.target.value)}
                  rows={5}
                  className="website-input website-textarea"
                  placeholder="Provide a clear and helpful answer..."
                />
              </div>

              <div className="website-form-split">
                <div className="website-form-group">
                  <label className="website-form-label" htmlFor="faq-order">
                    Display order
                  </label>
                  <input
                    id="faq-order"
                    type="number"
                    min="1"
                    value={form.sort_order}
                    onChange={(e) =>
                      setF("sort_order", parseInt(e.target.value, 10) || 1)
                    }
                    className="website-input"
                  />
                  <span className="website-form-help">
                    Lower numbers appear first.
                  </span>
                </div>

                <div className="website-form-group">
                  <span className="website-form-label">Visibility</span>
                  <button
                    type="button"
                    onClick={() => setF("is_visible", !form.is_visible)}
                    className="website-switch-row"
                  >
                    <span
                      className={`website-switch ${
                        form.is_visible ? "is-on" : ""
                      }`}
                      aria-hidden="true"
                    >
                      <span />
                    </span>
                    <span>
                      {form.is_visible ? "Visible on website" : "Hidden"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="website-modal-actions">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="website-btn website-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="website-btn website-btn-primary"
                >
                  {saving
                    ? "Saving..."
                    : modal === "add"
                      ? "Add FAQ"
                      : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
