const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pdfPath = "admin/frontend/src/utils/projectAgreementPdf.js";
const adminPagePath = "admin/frontend/src/pages/blueprints/ContractsPage.jsx";
const customerPagePath =
  "admin/frontend/src/pages/customer/customrequestdetailpage.jsx";
const customerControllerPath =
  "admin/backend/controllers/customer/customer.customorders.js";
const logoPath =
  "admin/frontend/src/pages/customer/spiral-wood-contract-logo.png";

const pdf = read(pdfPath);
const adminPage = read(adminPagePath);
const customerPage = read(customerPagePath);
const customerController = read(customerControllerPath);
const logoBytes = fs.readFileSync(path.join(repoRoot, logoPath));

assert(
  pdf.includes('import contractLogo from "../pages/customer/spiral-wood-contract-logo.png";'),
  "Project Agreement PDF must use the supporting-document Spiral Wood logo asset.",
);
assert(
  pdf.includes("export async function downloadProjectAgreementPdf"),
  "Project Agreement PDF generator must remain async so the logo can be embedded safely.",
);
assert(
  pdf.includes('doc.text("CONTRACT AGREEMENT"'),
  "Formal CONTRACT AGREEMENT heading is missing.",
);
assert(
  pdf.includes('writeParagraph("WITNESSETH AS FOLLOWS:"'),
  "Formal WITNESSETH wording is missing.",
);
assert(
  pdf.includes('doc.text("SCOPE OF WORK"') || pdf.includes('drawSectionHeading("SCOPE OF WORK"'),
  "SCOPE OF WORK section is missing.",
);
assert(
  pdf.includes('doc.text("CONTRACT TERMS AND CONDITIONS"'),
  "Formal contract terms heading is missing.",
);
assert(
  pdf.includes('doc.text("ACCEPTANCE RECORD"'),
  "ACCEPTANCE RECORD section is missing.",
);
assert(
  pdf.includes("The Customer accepted this Agreement through the WISDOM Customer Account."),
  "Acceptance wording must reflect the actual WISDOM account acceptance action.",
);
assert(
  pdf.includes('["Method", "WISDOM Customer Account"]'),
  "Acceptance method must be WISDOM Customer Account.",
);
assert(
  !pdf.includes("Notary Public") &&
    !pdf.includes("Name / Signature") &&
    !pdf.includes("IN WITNESS WHEREOF"),
  "Generated Project Agreement must not invent physical signature, witness, or notary execution.",
);
assert(
  pdf.includes('if (!isPickup)') && pdf.includes('drawMoneyRow("LOGISTICS"'),
  "Delivery-only logistics behavior must remain fulfillment-aware.",
);
assert(
  pdf.includes('isPickup ? "Pickup" : "Delivery"'),
  "Fulfillment label must preserve Pickup versus Delivery.",
);
assert(
  pdf.includes("number: match[2]"),
  "Stored agreement section numbering must be preserved rather than renumbered.",
);

assert(
  adminPage.includes("const DEFAULT_TERMS = `3. PAYMENT") &&
    adminPage.includes("8. GOVERNING LAW"),
  "Future Project Agreements must use the formal supporting-document term numbering.",
);
assert(
  adminPage.includes("await downloadProjectAgreementPdf({"),
  "Admin contract download must await the async PDF generator.",
);
assert(
  customerPage.includes("const handleDownloadProjectAgreement = async () =>") &&
    customerPage.includes("await downloadProjectAgreementPdf({"),
  "Customer contract download must await the async PDF generator.",
);
assert(
  customerPage.includes(
    'projectAgreement.customer_email || requestData.customer_email || ""',
  ),
  "Customer-side Acceptance Record must prefer the canonical Project Agreement account email.",
);
assert(
  customerController.includes("AS customer_email"),
  "Customer Project Agreement detail must expose the signed-in customer's email for the Acceptance Record.",
);
assert(
  customerController.includes(
    "customer_email: order.customer_email || null",
  ),
  "Project Agreement payload must carry the canonical customer account email so immediate post-acceptance downloads do not fall back to a generic account label.",
);
assert(
  logoBytes.length > 1000,
  "Contract logo asset is missing or unexpectedly empty.",
);
assert(
  pdf.includes('assemblyNormalized === "included"') &&
    pdf.includes('"Included (Free)"'),
  "Project Agreement must preserve the customer-facing Included (Free) assembly wording.",
);
assert(
  pdf.includes("const paymentClause =") &&
    pdf.includes("amounting to \${formatMoney(") &&
    pdf.includes("remainingBalance"),
  "Payment clause must show the exact total, minimum down payment, and remaining balance.",
);
assert(
  pdf.includes("const drawPageLogo =") &&
    pdf.includes("drawPageLogo({") &&
    pdf.includes("const startTermsPage = () =>"),
  "Project Agreement must embed the Spiral Wood logo on every generated page type.",
);

console.log("PASS: Project Agreement formal contract format integrity checks.");
console.log("- Supporting-document logo: present");
console.log("- Formal contract headings/wording: present");
console.log("- Acceptance Record: WISDOM account acceptance only");
console.log("- Physical signature/witness/notary blocks: absent");
console.log("- Pickup/Delivery fulfillment-aware costing: preserved");
console.log("- Customer account email: available for Acceptance Record");
