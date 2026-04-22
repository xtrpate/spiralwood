import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "April 23, 2026";
const BUSINESS_EMAIL = "spiralwoodservices@gmail.com";
const BUSINESS_PHONE = "09530695310";
const BUSINESS_ADDRESS = "8 Sitio Laot, Prenza 1, Marilao, Bulacan";

const sections = [
  {
    title: "1. About the Service",
    paragraphs: [
      "These Terms of Service govern your access to and use of the Spiral Wood Services website and the WISDOM Web-Based Sales and Inventory System with Digital Blueprint features made available to customers.",
      "The platform may allow you to browse products, create an account, verify your email, submit custom furniture or blueprint-related requests, place orders, upload payment proof where applicable, track order progress, request appointments, and submit warranty claims.",
    ],
  },
  {
    title: "2. Acceptance of Terms",
    paragraphs: [
      "By creating an account, accessing the website, placing an order, uploading files, or using any customer-facing feature of the platform, you agree to be bound by these Terms of Service and our Privacy Policy.",
      "If you do not agree with these Terms, please do not use the protected features of the platform.",
    ],
  },
  {
    title: "3. Account Registration and Security",
    paragraphs: [
      "To use protected customer features, you must provide accurate, complete, and current information during registration.",
      "You agree that the information you submit is true and updated, that your email address and contact details belong to you or are lawfully used by you, and that you will complete any required OTP or email verification process.",
      "You are responsible for maintaining the confidentiality of your login credentials and for all activities performed using your account.",
      "Spiral Wood Services may suspend, restrict, or deactivate accounts that contain false information, abusive activity, suspicious transactions, or violations of these Terms.",
    ],
  },
  {
    title: "4. Product Listings, Visuals, and Availability",
    paragraphs: [
      "We make reasonable efforts to display product names, descriptions, dimensions, finishes, prices, and availability as accurately as possible.",
      "However, actual colors, textures, wood grain, finishes, and final furniture appearance may vary due to screen settings, lighting conditions, natural material variation, hardware availability, supplier changes, and production adjustments.",
      "All products, pricing, availability, and lead times remain subject to confirmation, revision, or temporary unavailability.",
    ],
  },
  {
    title: "5. Blueprint Viewing, Customization, and Custom Requests",
    paragraphs: [
      "The website may allow customers to view blueprint-based furniture options, select templated designs, and submit customization requests within the limits defined by Spiral Wood Services.",
      "Customer customization input, uploaded reference images, measurements, notes, and preferences are treated as a request for review and do not automatically guarantee production, pricing lock-in, or immediate acceptance.",
      "Custom or blueprint-based requests may still require internal review, clarification, estimation, payment verification, contract generation, production approval, and schedule confirmation before fulfillment.",
    ],
  },
  {
    title: "6. Orders and Payment",
    paragraphs: [
      "When you place an order, you agree that your order details, contact information, delivery information, and payment information are accurate and complete.",
      "Payment terms may vary depending on the product type, order type, and payment method made available on the platform.",
      "Standard products may require full payment or another payment arrangement presented during checkout. Custom or blueprint-based products may follow a staged or milestone-based payment flow, including down payment requirements before production begins.",
      "Submission of proof of payment does not automatically mean that the payment has already been verified or approved.",
    ],
  },
  {
    title: "7. Delivery, Installation, and Appointments",
    paragraphs: [
      "Some orders may require delivery, site visits, measurement appointments, installation schedules, or similar service coordination.",
      "You agree to provide a complete and accurate address, contact number, and any other required scheduling information.",
      "Delivery, installation, and appointment dates may change due to routing conditions, production status, manpower availability, weather, site access limitations, safety concerns, or other operational reasons.",
      "An authorized person should be available to receive the order, coordinate the visit, or attend the scheduled appointment.",
    ],
  },
  {
    title: "8. Cancellation, Refunds, and Order Changes",
    paragraphs: [
      "Cancellation and refund handling may depend on the order type, production stage, contract status, and applicable business rules shown on the platform or communicated during the transaction.",
      "For standard products, eligibility for cancellation or refund may depend on order status, shipment status, item condition, and applicable consumer protection rules.",
      "For custom or blueprint-based products, cancellation after down payment or after significant project processing may be subject to processing fees, partial refunds, or non-refundable stages where clearly communicated and allowed by applicable law.",
      "Nothing in these Terms removes any remedy that may be available to consumers under applicable law for defective, misrepresented, or non-conforming goods or services.",
    ],
  },
  {
    title: "9. Warranty",
    paragraphs: [
      "Eligible completed orders may qualify for warranty review subject to the applicable warranty period, product condition, and verification process of Spiral Wood Services.",
      "Warranty claims may require supporting proof such as order references, photos, descriptions, receipts, or other documentation reasonably needed for evaluation.",
      "Warranty coverage may be denied where damage or issues are caused by misuse, neglect, unauthorized alteration, improper handling, accidental damage, force majeure, third-party modifications, or normal wear and tear, unless otherwise provided in a written agreement or specific product warranty.",
    ],
  },
  {
    title: "10. Customer Uploads and Submitted Content",
    paragraphs: [
      "If you upload payment proofs, reference images, furniture preferences, notes, warranty evidence, or other content, you confirm that you own the content or have the right to submit it.",
      "You also confirm that your uploads do not violate any law, third-party rights, or intellectual property rights and do not contain malicious, fraudulent, obscene, or abusive material.",
      "You allow Spiral Wood Services to use submitted content only for account verification, order processing, custom request review, design clarification, production coordination, delivery handling, warranty evaluation, customer support, fraud prevention, security review, and related recordkeeping.",
    ],
  },
  {
    title: "11. Acceptable Use",
    paragraphs: [
      "You agree not to use the platform for unlawful, fraudulent, abusive, or harmful purposes.",
      "You must not attempt unauthorized access to any account, admin feature, staff feature, database, or backend service, and you must not interfere with the security, stability, or availability of the platform.",
    ],
  },
  {
    title: "12. Intellectual Property",
    paragraphs: [
      "The WISDOM platform, website content, branding, page layout, text, and platform-generated materials owned by Spiral Wood Services remain the property of Spiral Wood Services or its licensors, unless otherwise stated.",
      "You may not copy, reproduce, scrape, resell, reverse-engineer, or reuse platform content for unauthorized commercial purposes without written permission.",
    ],
  },
  {
    title: "13. Service Availability and Limitation of Liability",
    paragraphs: [
      "We work to keep the platform available and reasonably accurate, but we do not guarantee uninterrupted operation, error-free access, or immediate availability of every feature at all times.",
      "To the extent allowed by law, Spiral Wood Services shall not be liable for indirect or consequential losses arising from outages, delays, inaccurate user submissions, third-party service interruptions, or events beyond reasonable control.",
      "This limitation does not remove liability where liability cannot be waived under applicable law.",
    ],
  },
  {
    title: "14. Changes to these Terms",
    paragraphs: [
      "We may update these Terms of Service from time to time to reflect legal, business, operational, or platform changes.",
      "Any updated version will be posted on this page with a revised effective date. Continued use of the platform after publication of the updated Terms means you accept the revised version.",
    ],
  },
  {
    title: "15. Contact Information",
    paragraphs: [
      "For questions about these Terms of Service, you may contact Spiral Wood Services using the contact details below.",
    ],
  },
];

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7f7f5",
    padding: "40px 16px 80px",
  },
  wrap: {
    maxWidth: 960,
    margin: "0 auto",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    padding: "32px 24px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#6b7280",
    marginBottom: 10,
  },
  title: {
    fontSize: 34,
    lineHeight: 1.15,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  subtitle: {
    marginTop: 12,
    color: "#4b5563",
    lineHeight: 1.7,
    fontSize: 15,
  },
  section: {
    marginTop: 28,
    paddingTop: 24,
    borderTop: "1px solid #ececec",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 12,
  },
  paragraph: {
    margin: "0 0 12px",
    color: "#374151",
    lineHeight: 1.8,
    fontSize: 15,
  },
  footerBox: {
    marginTop: 28,
    padding: 20,
    background: "#fafafa",
    border: "1px solid #ececec",
  },
  linkRow: {
    marginTop: 24,
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  btn: {
    display: "inline-block",
    padding: "12px 18px",
    border: "1px solid #111827",
    color: "#111827",
    textDecoration: "none",
    fontWeight: 600,
  },
  btnDark: {
    display: "inline-block",
    padding: "12px 18px",
    border: "1px solid #111827",
    background: "#111827",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 600,
  },
};

export default function TermsPage() {
  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.eyebrow}>Spiral Wood Services</div>
          <h1 style={styles.title}>Terms of Service</h1>
          <p style={styles.subtitle}>
            Effective Date: {EFFECTIVE_DATE}
            <br />
            These Terms apply to the customer-facing website and related WISDOM
            customer portal features of Spiral Wood Services.
          </p>

          {sections.map((section) => (
            <section key={section.title} style={styles.section}>
              <h2 style={styles.sectionTitle}>{section.title}</h2>
              {section.paragraphs.map((text, index) => (
                <p key={index} style={styles.paragraph}>
                  {text}
                </p>
              ))}
            </section>
          ))}

          <div style={styles.footerBox}>
            <p style={styles.paragraph}>
              <strong>Email:</strong> {BUSINESS_EMAIL}
            </p>
            <p style={styles.paragraph}>
              <strong>Phone:</strong> {BUSINESS_PHONE}
            </p>
            <p style={{ ...styles.paragraph, marginBottom: 0 }}>
              <strong>Address:</strong> {BUSINESS_ADDRESS}
            </p>
          </div>

          <div style={styles.linkRow}>
            <Link to="/privacy" style={styles.btn}>
              View Privacy Policy
            </Link>
            <Link to="/register" style={styles.btnDark}>
              Back to Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}