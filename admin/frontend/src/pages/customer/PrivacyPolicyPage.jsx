import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "April 23, 2026";
const BUSINESS_EMAIL = "spiralwoodservices@gmail.com";
const BUSINESS_PHONE = "09530695310";
const BUSINESS_ADDRESS = "8 Sitio Laot, Prenza 1, Marilao, Bulacan";

const sections = [
  {
    title: "1. Introduction",
    paragraphs: [
      "Spiral Wood Services respects your privacy and is committed to protecting your personal data.",
      "This Privacy Policy explains what information we collect through the customer-facing WISDOM website and related services, why we collect it, how we use it, who may receive it, how long we retain it, and what rights you may exercise under applicable law.",
    ],
  },
  {
    title: "2. Personal Data We May Collect",
    paragraphs: [
      "Depending on the feature you use, we may collect account and profile information such as your name, email address, phone number, home or delivery address, account status, verification status, and login-related records.",
      "We may also collect order and transaction information such as product selections, blueprint or customization preferences, order history, delivery details, appointment details, payment status, and receipt-related information.",
      "Where applicable, we may collect uploaded proof of payment, reference images, custom request notes, warranty claim details, supporting photos or documents, and customer support communications.",
      "For security and technical operations, we may process IP address, device or browser data, access logs, account activity records, audit-related records, and system backup records necessary to maintain service integrity and protect the platform.",
    ],
  },
  {
    title: "3. Why We Process Your Data",
    paragraphs: [
      "We process personal data only for legitimate and specific business purposes related to the services we provide.",
      "These purposes may include account creation, email or OTP verification, login security, order processing, custom request handling, blueprint-related review, payment verification, order status updates, appointment scheduling, delivery coordination, warranty handling, customer support, fraud prevention, security monitoring, recordkeeping, and compliance with legal, accounting, tax, consumer protection, and operational requirements.",
    ],
  },
  {
    title: "4. Basis of Processing",
    paragraphs: [
      "Our basis for processing depends on the activity involved. Where applicable, processing may be based on your consent, on steps necessary to process your request or transaction, on compliance with legal obligations, or on legitimate interests such as fraud prevention, platform security, dispute handling, service administration, and operational recordkeeping.",
      "Where consent is required, you may be asked to give it through the relevant form or transaction flow.",
    ],
  },
  {
    title: "5. How We Collect and Use Data",
    paragraphs: [
      "We collect personal data directly from you through registration forms, login flows, verification pages, order forms, payment proof uploads, custom request forms, warranty forms, profile settings, appointment forms, and your general use of the website.",
      "We use reasonable administrative, organizational, physical, and technical measures to protect personal data, including role-based access controls, account verification processes, restricted internal access, and security measures designed to reduce unauthorized access, misuse, loss, or disclosure.",
    ],
  },
  {
    title: "6. Who May Receive Your Data",
    paragraphs: [
      "Your personal data may be accessed only by authorized Spiral Wood Services administrators, staff, assigned personnel, and service providers who need the information to support account handling, order processing, delivery, appointments, customer service, hosting, storage, email delivery, backup operations, security review, and related business operations.",
      "We may also disclose information where required by law, regulation, court order, lawful request of government authorities, or where necessary for the establishment, exercise, or defense of legal claims.",
      "We do not sell your personal data.",
    ],
  },
  {
    title: "7. Retention of Data",
    paragraphs: [
      "We retain personal data only for as long as necessary for the purposes described in this Privacy Policy and for related legal, accounting, tax, audit, warranty, dispute-resolution, fraud prevention, security, and operational requirements.",
      "Account information may be retained while your account remains active and for a reasonable period thereafter as needed for compliance and security review.",
      "Order, receipt, payment verification, delivery, appointment, and warranty records may be retained as long as reasonably necessary for transaction support, legal compliance, customer support, and internal auditing.",
      "Archived or backup-related records may also be retained according to operational and disaster-recovery requirements.",
    ],
  },
  {
    title: "8. Your Rights",
    paragraphs: [
      "Subject to applicable law and reasonable verification requirements, you may have rights as a data subject, including the right to be informed, right to access, right to object, right to rectify, right to erasure or blocking, right to data portability, right to file a complaint, and right to damages.",
      "If you wish to exercise any privacy-related right, you may contact us using the contact details below.",
    ],
  },
  {
    title: "9. Third-Party Services and Links",
    paragraphs: [
      "The website may use or link to third-party services or pages that have their own terms and privacy practices. When you interact with those third-party services, their own rules may apply.",
      "We encourage users to review the privacy practices of any relevant third-party service before sharing information directly with them.",
    ],
  },
  {
    title: "10. Changes to this Privacy Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time to reflect legal, operational, technical, or business changes.",
      "Any updated version will be posted on this page with a revised effective date. Continued use of the platform after publication of the updated version means you acknowledge the changes.",
    ],
  },
  {
    title: "11. Contact Us",
    paragraphs: [
      "For privacy concerns, privacy requests, or questions about this Privacy Policy, please contact Spiral Wood Services using the contact details below.",
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
            This Privacy Policy applies to the customer-facing website and
            related WISDOM customer portal features of Spiral Wood Services.
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