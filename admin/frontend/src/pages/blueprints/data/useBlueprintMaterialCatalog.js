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
