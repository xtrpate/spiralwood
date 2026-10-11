"use strict";

// WISDOM W3 — INTERNAL DEVELOPMENT REFERENCE COSTS, NOT SUPPLIER QUOTATIONS.
// This module intentionally is not imported by the customer frontend, F1/F2
// quotation formula, inventory, orders, or delivery modules.
//
// 8 rates below were sourced from the WISDOM SAMPLE/DEVELOPMENT material
// catalog (2026-10-08), NOT validated live supplier invoices.
// Tanguile and Gmelina are PROVISIONAL research-based estimates.
// Admin determines how many physical planks are required and confirms whether
// the real panel construction / thickness is feasible. NO automatic counts.
// The rates are cost per STANDARD PLANK, NOT cost per furniture component.

const WOOD_REFERENCE_PRICE_VERSION = "W3-2026-10-11";

const WOOD_REFERENCE_PRICES = Object.freeze([
  { id: "mahogany", name: "Mahogany", cost_per_plank: 1450, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "sample_catalog" },
  { id: "pine", name: "Pine", cost_per_plank: 650, length_mm: 2400, width_mm: 100, thickness_mm: 38, evidence: "sample_catalog" },
  { id: "acacia", name: "Acacia", cost_per_plank: 1250, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "sample_catalog" },
  { id: "narra", name: "Narra", cost_per_plank: 3500, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "sample_catalog" },
  { id: "tanguile", name: "Tanguile", cost_per_plank: 500, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "provisional_research_estimate" },
  { id: "gmelina", name: "Gmelina", cost_per_plank: 300, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "provisional_research_estimate" },
  { id: "rubberwood", name: "Rubberwood", cost_per_plank: 850, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "sample_catalog" },
  { id: "teak", name: "Teak", cost_per_plank: 3100, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "sample_catalog" },
  { id: "oak", name: "Oak", cost_per_plank: 2650, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "sample_catalog" },
  { id: "maple", name: "Maple", cost_per_plank: 2350, length_mm: 2400, width_mm: 100, thickness_mm: 50, evidence: "sample_catalog" },
].map((wood) => Object.freeze({
  ...wood,
  unit: "plank",
  supplier_price_verified: false,
  price_use: "development_reference_only",
})));

const pricesById = new Map(WOOD_REFERENCE_PRICES.map((wood) => [wood.id, wood]));

function findWoodReference(woodType) {
  if (typeof woodType !== "string") return null;
  const id = woodType.trim().toLowerCase();
  return pricesById.get(id) || null;
}

function roundMoney(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1e12) {
    throw new RangeError("Wood material cost exceeds valid monetary range.");
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// PURE calculator for later Admin integration. NEVER reads/derives the quantity
// from the 3D model; NEVER writes a quotation; NEVER touches inventory.
// Inputs must be explicitly Admin-confirmed standard-plank quantities.
function calculateAdminConfirmedWoodReferenceCost({ materials, adminConfirmed = false } = {}) {
  if (adminConfirmed !== true) {
    throw new RangeError("An Admin confirmation is required before calculating reference costs.");
  }
  if (!Array.isArray(materials) || materials.length < 1) {
    throw new RangeError("Admin-confirmed wood materials are required.");
  }
  let total = 0;
  const seen = new Set();
  const lines = materials.map((material) => {
    if (!material || material.unit !== "plank") {
      throw new RangeError("Wood reference prices are for planks only; not plywood sheets or panels.");
    }
    const record = findWoodReference(material.wood_type);
    if (!record) throw new RangeError("Unknown wood type: manual review required.");
    if (seen.has(record.id)) {
      throw new RangeError("Repeated wood type must be combined into one manual quantity to avoid duplicate charging.");
    }
    seen.add(record.id);
    const qty = material.quantity;
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100000) {
      throw new RangeError("Admin plank quantity must be a positive whole number.");
    }
    const subtotal = roundMoney(record.cost_per_plank * qty);
    total = roundMoney(total + subtotal);
    return Object.freeze({
      wood_type: record.name,
      unit: record.unit,
      quantity: qty,
      reference_unit_cost: record.cost_per_plank,
      subtotal,
      evidence: record.evidence,
      supplier_price_verified: false,
    });
  });
  return Object.freeze({
    version: WOOD_REFERENCE_PRICE_VERSION,
    pricing_scope: "internal_development_reference_only",
    material_reference_cost: total,
    admin_quantity_confirmed: true,
    supplier_prices_verified: false,
    requires_admin_construction_and_price_review: true,
    connected_to_customer_quotation: false,
    lines: Object.freeze(lines),
  });
}

module.exports = {
  WOOD_REFERENCE_PRICE_VERSION,
  WOOD_REFERENCE_PRICES,
  findWoodReference,
  calculateAdminConfirmedWoodReferenceCost,
};
