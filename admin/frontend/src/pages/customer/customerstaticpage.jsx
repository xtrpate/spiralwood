import React, { useEffect, useState } from "react";
import api from "../../services/api";

export default function CustomerStaticPage({ slug }) {
  const [pageData, setPageData] = useState(null);
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // Group the API requests so we can wait for all of them to finish
    const requests = [api.get(`/website/pages/${slug}`)];
    if (slug === "faq") {
      requests.push(api.get("/website/faqs"));
    }

    Promise.all(requests)
      .then((responses) => {
        if (!active) return;

        // Fix 1: Handle if the database returns an array instead of a direct object
        const pageRes = responses[0].data;
        const pageObj = Array.isArray(pageRes) ? pageRes[0] : pageRes;
        setPageData(pageObj || null);

        if (slug === "faq" && responses[1]) {
          const faqRes = responses[1].data || [];

          // Fix 2: Handle MySQL booleans (1 or 0) for the FAQ visibility
          setFaqs(
            faqRes.filter(
              (f) =>
                f.is_visible === true ||
                f.is_visible === 1 ||
                f.is_visible === "1",
            ),
          );
        }
      })
      .catch((err) => console.error("Failed to load page content:", err))
      .finally(() => {
        // Only turn off the loading state AFTER the data has safely arrived
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div
        style={{ padding: "120px 20px", textAlign: "center", color: "#6b7280" }}
      >
        Loading content...
      </div>
    );
  }

  // If the database query returned absolutely nothing
  if (!pageData) {
    return (
      <div
        style={{ padding: "120px 20px", textAlign: "center", color: "#6b7280" }}
      >
        Failed to load page data.
      </div>
    );
  }

  // Safely check for MySQL boolean (1 or 0) on the page visibility
  const isVisible =
    pageData.is_visible === true ||
    pageData.is_visible === 1 ||
    pageData.is_visible === "1";

  if (!isVisible) {
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
