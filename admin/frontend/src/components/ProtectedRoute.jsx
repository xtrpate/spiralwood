import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import useAuthStore from "../store/authStore";

const DEFAULT_AUTHORITY = "user";

export default function ProtectedRoute({ allowedRoles = [], children }) {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  const authority = String(user.authority_level || DEFAULT_AUTHORITY)
    .trim()
    .toLowerCase();

  if (
    !allowed.map((value) => String(value).toLowerCase()).includes(authority)
  ) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  return children;
}

function getDefaultRouteForUser(user) {
  if (user?.role === "customer") {
    return "/";
  }

  if (user?.role === "staff") {
    if (user.staff_type === "delivery_rider") {
      return "/staff/rider-dashboard";
    }

    if (user.staff_type === "cashier") {
      return "/staff/order";
    }

    return "/staff/dashboard";
  }

  return "/admin/dashboard";
}

export { DEFAULT_AUTHORITY };
