import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "August 11, 2026";
const BUSINESS_EMAIL = "spiralwoodservices@gmail.com";
const BUSINESS_PHONE = "09530695310";
const BUSINESS_ADDRESS = "8 Sitio Laot, Prenza 1, Marilao, Bulacan";

const sections = [
  {
    title: "1. About the Service",
    paragraphs: [
      "These Terms of Service apply to the Spiral Wood Services website and the customer features available through WISDOM.",
      "WISDOM may allow you to browse furniture, create an account, verify your email, place orders, submit custom furniture or blueprint requests, upload payment proof when required, track order progress, request appointments, send support requests, and submit warranty claims.",
    ],
  },
  {
    title: "2. Acceptance of Terms",
    paragraphs: [
      "By creating an account or using the customer features of WISDOM, you agree to follow these Terms of Service and our Privacy Policy.",
      "If you do not agree with these Terms, please do not use features that require an account or a transaction.",
    ],
  },
  {
    title: "3. Account and Security",
    paragraphs: [
      "You must provide accurate and current information when you create or update your account.",
      "You are responsible for using an email address and contact details that belong to you or that you are allowed to use. You must also complete any required email or OTP verification.",
      "Keep your password and account access private. You are responsible for activity made through your account unless you report unauthorized access to us.",
      "Spiral Wood Services may restrict or deactivate an account when there is false information, suspicious activity, abuse, fraud, or a serious violation of these Terms.",
    ],
  },
  {
    title: "4. Product Information and Availability",
    paragraphs: [
      "We try to keep product names, descriptions, dimensions, finishes, prices, and stock information accurate.",
      "Actual color, wood grain, texture, finish, and appearance may vary because of screen settings, lighting, natural material differences, available hardware, supplier changes, or production needs.",
      "Prices, stock, materials, and lead times may still require confirmation and may change when necessary.",
    ],
  },
  {
    title: "5. Custom Furniture and Blueprints",
    paragraphs: [
      "WISDOM may let you view furniture designs, use available templates, provide measurements, upload reference images, and submit customization requests.",
      "A submitted design, image, measurement, note, or preference is a request for review. It does not automatically confirm the final design, price, production schedule, or acceptance of the project.",
      "Custom furniture and blueprint requests may require review, clarification, quotation, customer approval, payment verification, contract preparation, production approval, and schedule confirmation before work begins.",
    ],
  },
  {
    title: "6. Orders and Payments",
    paragraphs: [
      "When placing an order, you must provide correct order details, contact information, delivery information, and payment information.",
      "The payment process may depend on the product or project. Standard products may require full payment or another payment option shown during checkout.",
      "Custom or blueprint projects may require a down payment before production and a remaining balance at a later stage.",
      "Uploading payment proof does not mean the payment is already verified. Payment is considered verified only after the required review or confirmation is completed.",
    ],
  },
  {
    title: "7. Delivery, Installation and Appointments",
    paragraphs: [
      "Some orders may require delivery, installation, site measurement, consultation, or another scheduled visit.",
      "You must provide a complete address, active contact number, and other information needed for the visit.",
      "Schedules may change because of production progress, delivery routing, staff availability, weather, site conditions, safety concerns, or other reasonable operational issues.",
      "Please make sure you or an authorized person is available at the agreed location and time.",
    ],
  },
  {
    title: "8. Cancellations, Refunds and Changes",
    paragraphs: [
      "Cancellation, refund, and order-change options may depend on the order type, payment status, production stage, delivery status, and any agreement connected to the order.",
      "For standard products, a cancellation or refund may also depend on the condition and status of the item.",
      "For custom furniture, costs already used for approved design work, materials, or production may affect the amount that can be refunded when allowed by law and clearly communicated to the customer.",
      "These Terms do not remove any customer right or remedy that cannot legally be waived, including rights that may apply to defective or misrepresented goods or services.",
    ],
  },
  {
    title: "9. Warranty",
    paragraphs: [
      "Eligible completed orders may be submitted for warranty review based on the applicable warranty period and the condition of the product.",
      "We may ask for the order reference, receipt, photos, description of the issue, or other information needed to review the claim.",
      "Warranty coverage may not apply to damage caused by misuse, neglect, unauthorized changes, improper handling, accidental damage, normal wear, or work performed by another party, unless a written warranty or applicable law provides otherwise.",
    ],
  },
  {
    title: "10. Customer Uploads",
    paragraphs: [
      "When you upload payment proof, reference images, photos, notes, documents, or other content, you confirm that you have the right to submit them.",
      "Do not upload content that is unlawful, fraudulent, harmful, abusive, or that violates another person's rights.",
      "Spiral Wood Services may use your submitted content only for the services connected to your account or transaction, such as order processing, custom design review, payment verification, production, delivery, appointments, warranty review, customer support, security, and recordkeeping.",
    ],
  },
  {
    title: "11. Acceptable Use",
    paragraphs: [
      "Do not use WISDOM for illegal, fraudulent, abusive, or harmful activity.",
      "Do not attempt to access another user's account, restricted staff or admin features, databases, servers, or other protected parts of the system without permission.",
      "Do not intentionally disrupt, damage, overload, or misuse the website or its services.",
    ],
  },
  {
    title: "12. Intellectual Property",
    paragraphs: [
      "The WISDOM system, Spiral Wood Services branding, website content, and business-owned materials remain the property of Spiral Wood Services or their lawful owners unless stated otherwise.",
      "You may not copy, resell, publish, scrape, reverse-engineer, or use protected system content for unauthorized commercial purposes without permission.",
    ],
  },
  {
    title: "13. Service Availability",
    paragraphs: [
      "We work to keep WISDOM available and accurate, but temporary errors, maintenance, internet problems, third-party service issues, or other interruptions may happen.",
      "We may correct errors, update information, or temporarily limit a feature when needed for security, maintenance, or normal business operations.",
      "Any limitation of responsibility under these Terms applies only to the extent allowed by applicable law.",
    ],
  },
  {
    title: "14. Changes to these Terms",
    paragraphs: [
      "We may update these Terms when our services, business process, system features, or legal requirements change.",
      "The updated Terms will be posted on this page with a new effective date. Please review this page from time to time.",
    ],
  },
  {
    title: "15. Contact Information",
    paragraphs: [
      "If you have questions about these Terms of Service, please contact Spiral Wood Services using the information below.",
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
            These Terms apply to the Spiral Wood Services website and the customer
            features available through WISDOM.
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