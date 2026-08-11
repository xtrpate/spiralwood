import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "August 11, 2026";
const BUSINESS_EMAIL = "spiralwoodservices@gmail.com";
const BUSINESS_PHONE = "09530695310";
const BUSINESS_ADDRESS = "8 Sitio Laot, Prenza 1, Marilao, Bulacan";

const sections = [
  {
    title: "1. Overview",
    paragraphs: [
      "Spiral Wood Services respects your privacy and works to protect the personal data you provide through WISDOM.",
      "This Privacy Policy explains what information we may collect, why we use it, who may access it, how long we may keep it, and the privacy rights available to you under applicable law.",
    ],
  },
  {
    title: "2. Information We May Collect",
    paragraphs: [
      "We may collect account information such as your name, email address, phone number, address, account status, and verification status.",
      "We may collect transaction information such as product selections, custom furniture or blueprint requests, orders, delivery details, appointment details, payment status, and receipt information.",
      "When you use certain features, we may also receive payment proof, reference images, measurements, notes, warranty information, supporting photos or documents, and messages sent to customer support.",
      "For security and system operation, we may process technical information such as IP address, browser or device information, login records, account activity, audit records, and system logs.",
    ],
  },
  {
    title: "3. How We Use Your Information",
    paragraphs: [
      "We use personal data only for clear and legitimate purposes connected to the services we provide.",
      "These purposes may include creating and verifying accounts, securing login access, processing orders, reviewing custom furniture and blueprint requests, verifying payments, updating order status, arranging appointments, coordinating delivery or installation, reviewing warranty claims, providing customer support, preventing fraud, maintaining records, and meeting legal or business requirements.",
    ],
  },
  {
    title: "4. Basis for Processing",
    paragraphs: [
      "Depending on the activity, we may process personal data with your consent, because it is needed to handle your request or transaction, because the law requires it, or because it is reasonably needed for security, fraud prevention, dispute handling, service administration, or recordkeeping.",
      "When consent is required, we will request it through the relevant form or process. Where applicable, you may withdraw consent, subject to legal or contractual limits.",
    ],
  },
  {
    title: "5. How We Protect Your Data",
    paragraphs: [
      "We use reasonable administrative, physical, and technical measures to protect personal data against unauthorized access, loss, misuse, alteration, or disclosure.",
      "These measures may include account verification, role-based access, restricted staff access, authentication controls, activity records, backups, and other security measures used by the system.",
      "No online system can guarantee absolute security, but we work to use safeguards that are appropriate for the information and services involved.",
    ],
  },
  {
    title: "6. Who May Access Your Data",
    paragraphs: [
      "Personal data may be accessed by authorized Spiral Wood Services administrators, staff, and assigned personnel only when they need it to perform their work.",
      "Service providers may also process limited information when needed for services such as hosting, file storage, email delivery, payment processing, security, or backup operations. Their access should be limited to the service they provide.",
      "We may disclose information when required by law, a lawful government request, a court order, or when reasonably needed to protect legal rights or investigate fraud or security issues.",
      "Spiral Wood Services does not sell your personal data.",
    ],
  },
  {
    title: "7. How Long We Keep Data",
    paragraphs: [
      "We keep personal data only for as long as reasonably needed for the purpose it was collected and for applicable legal, accounting, tax, warranty, dispute, security, audit, and business record requirements.",
      "Account information may be kept while your account is active and for a reasonable period after it is closed when needed for security, records, or legal requirements.",
      "Order, payment, receipt, delivery, appointment, warranty, and support records may be kept for as long as needed to support the transaction and related business or legal requirements.",
      "Backup copies may be kept for a limited period as part of normal backup and recovery processes.",
    ],
  },
  {
    title: "8. Your Privacy Rights",
    paragraphs: [
      "Under the Philippine Data Privacy Act of 2012 and other applicable rules, you may have rights over your personal data, subject to legal conditions and reasonable identity verification.",
      "These rights may include the right to be informed, access your data, object to certain processing, correct inaccurate data, request erasure or blocking when allowed, receive data in a portable format when applicable, file a complaint, and claim damages when provided by law.",
      "To ask about or exercise a privacy right, please contact us using the information below. You may also contact the National Privacy Commission when applicable.",
    ],
  },
  {
    title: "9. Third-Party Services",
    paragraphs: [
      "WISDOM may use or link to third-party services. These services may have their own terms and privacy practices.",
      "When you directly use a third-party service, please review its privacy information before providing personal data.",
    ],
  },
  {
    title: "10. Changes to this Privacy Policy",
    paragraphs: [
      "We may update this Privacy Policy when our services, system features, business processes, or legal requirements change.",
      "The updated Privacy Policy will be posted on this page with a new effective date. Please review this page from time to time.",
    ],
  },
  {
    title: "11. Contact Us",
    paragraphs: [
      "For privacy questions, requests, or concerns, please contact Spiral Wood Services using the information below.",
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

export default function PrivacyPolicyPage() {
  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.eyebrow}>Spiral Wood Services</div>
          <h1 style={styles.title}>Privacy Policy</h1>
          <p style={styles.subtitle}>
            Effective Date: {EFFECTIVE_DATE}
            <br />
            This Privacy Policy applies to the Spiral Wood Services website and the
            customer features available through WISDOM.
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
            <Link to="/terms" style={styles.btn}>
              View Terms of Service
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