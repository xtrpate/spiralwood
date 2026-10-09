// Shared read-only material catalog for Admin Blueprint and Customer Customize.
// IDs are supplied by the server after exact name/size/unit matching; never
// hard-code a newly created raw_materials.id into the frontend.
import { useEffect, useState } from "react";
import api from "../../../services/api";

export function useBlueprintMaterialCatalog() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/customer/blueprints/material-catalog", {
      suppressGlobalErrorToast: true,
    }).then(({ data }) => {
      if (!active) return;
      const items = Array.isArray(data?.materials) ? data.materials : [];
      setMaterials(items);
      setError(items.length === 15 ? "" : "Material catalog is incomplete.");
    }).catch(() => {
      if (!active) return;
      setError("Material catalog unavailable. Existing saved materials are preserved.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return { materials, loading, error };
}

export function getApprovedMaterial(materials, value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return (Array.isArray(materials) ? materials : []).find(
    (item) =>
      item.status === "available" &&
      Number(item.raw_material_id) === id,
  ) || null;
}

export function materialAssignmentPatch(materials, value) {
  const entry = getApprovedMaterial(materials, value);
  if (!entry) return null;
  return {
    raw_material_id: Number(entry.raw_material_id),
    material: entry.label,
    wood_type: entry.label,
    // Intentionally does not change finish, color or geometry/thickness.
  };
}

// Conservative single-stock-piece fit. A part is not automatically
// joinable/laminated across sheets or planks in Phase A.
export function materialFitsPart(entry, component) {
  if (!entry || !component) return false;
  const dimensions = [component.width, component.height, component.depth]
    .map(Number).sort((a, b) => a - b);
  if (dimensions.some((size) => !Number.isFinite(size) || size <= 0)) return false;
  const thickness = Number(entry.thickness_mm);
  const stockSides = [entry.length_mm, entry.width_mm].map(Number)
    .sort((a, b) => a - b);
  if (stockSides.some((size) => !Number.isFinite(size) || size <= 0)) return false;
  return Math.abs(dimensions[0] - thickness) < 0.1 &&
    dimensions[1] <= stockSides[0] + 0.01 &&
    dimensions[2] <= stockSides[1] + 0.01;
}
