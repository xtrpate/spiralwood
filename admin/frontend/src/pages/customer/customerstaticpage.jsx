import React, { useEffect, useState } from "react";
import api from "../../services/api"; // Adjust path if necessary

export default function CustomerStaticPage({ slug }) {
  const [pageData, setPageData] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // 1. Fetch the main page content (Title and text body)
    api
      .get(`/website/pages/${slug}`)
      .then((res) => setPageData(res.data))
      .catch((err) => console.error("Failed to load page content:", err));

    // 2. If this is the FAQ page, also fetch the Q&A list
    if (slug === "faq") {
      api
        .get("/website/faqs")
        .then((res) => {
          // Only store FAQs that the admin toggled to "Visible"
          setFaqs(res.data.filter((f) => f.is_visible));
        })
        .catch((err) => console.error("Failed to load FAQs:", err));
    }

    setLoading(false);
  }, [slug]);

  if (loading || !pageData) {
    return (
      <div
        style={{ padding: "120px 20px", textAlign: "center", color: "#6b7280" }}
      >
        Loading content...
      </div>
    );
  }

  // If the admin hides the page via the toggle switch, hide it from the public
  if (!pageData.is_visible) {
    return (
      <div
        style={{ padding: "120px 20px", textAlign: "center", color: "#6b7280" }}
      >
        This page is currently unavailable.
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "860px",
        margin: "60px auto",
        padding: "0 24px",
        minHeight: "60vh",
      }}
    >
      <h1
        style={{
          fontSize: "36px",
          fontWeight: 800,
          color: "#111",
          marginBottom: "24px",
          letterSpacing: "-0.02em",
        }}
      >
        {pageData.title}
      </h1>

      {/* Renders the plain text written in the Admin dashboard with line breaks */}
      <div
        style={{
          fontSize: "16px",
          color: "#374151",
          lineHeight: 1.8,
          whiteSpace: "pre-wrap",
          marginBottom: "48px",
        }}
      >
        {pageData.content}
      </div>

      {/* Accordion list specifically for the FAQ page */}
      {slug === "faq" && faqs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {faqs.map((faq) => (
            <details
              key={faq.id}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                padding: "20px",
                borderRadius: "12px",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <summary
                style={{
                  fontWeight: 700,
                  fontSize: "16px",
                  color: "#111",
                  outline: "none",
                  listStylePosition: "inside",
                }}
              >
                {faq.question}
              </summary>
              <p
                style={{
                  marginTop: "14px",
                  color: "#4b5563",
                  lineHeight: 1.6,
                  paddingLeft: "18px",
                  borderLeft: "2px solid #e5e7eb",
                }}
              >
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
