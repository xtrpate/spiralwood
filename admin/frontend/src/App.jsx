import { useEffect } from "react";
import api, { buildAssetUrl } from "./services/api";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import "leaflet/dist/leaflet.css";
import { Toaster } from "react-hot-toast";
import useAuthStore from "./store/authStore";
import ErrorBoundary from "./components/ErrorBoundary";
import { SessionLoginFeedback } from "./components/MotionFeedbackOverlay";
import TasksPage from "./pages/tasks/TasksPage";

import MyTasks from "./pages/staff/MyTasks";
import ProductionBlueprintView from "./pages/staff/ProductionBlueprintView";

import AdminLayout from "./components/layout/AdminLayout";
import DashboardPage from "./pages/dashboard/DashboardPage";
import ProductsPage from "./pages/products/ProductsPage";
import ProductFormPage from "./pages/products/ProductFormPage";
import RawMaterialsPage from "./pages/inventory/RawMaterialsPage";
import BuildMaterialsPage from "./pages/inventory/BuildMaterialsPage";
import BuildMaterialFormPage from "./pages/inventory/BuildMaterialFormPage";
import StockMovementPage from "./pages/inventory/StockMovementPage";
import PhysicalInventoryPage from "./pages/inventory/PhysicalInventoryPage";
import StockTransferPage from "./pages/inventory/StockTransferPage";
import SuppliersPage from "./pages/inventory/SuppliersPage";
import BlueprintsPage from "./pages/blueprints/BlueprintsPage";
import BlueprintDesign from "./pages/blueprints/BlueprintDesign.jsx";
import EstimationPage from "./pages/blueprints/EstimationPage";
import ContractsPage from "./pages/blueprints/ContractsPage";
import OrdersPage from "./pages/orders/OrdersPage";
import OrderDetailPage from "./pages/orders/OrderDetailPage";
import CancellationsPage from "./pages/orders/CancellationsPage";
import SalesReportPage from "./pages/sales/SalesReportPage";
import CurrentInventoryReportPage from "./pages/reports/CurrentInventoryReportPage";
import DailyStockInReportPage from "./pages/reports/DailyStockInReportPage";
import DeliveryReportPage from "./pages/reports/DeliveryReportPage";
import WarrantyPage from "./pages/warranty/WarrantyPage";
import CustomersPage from "./pages/customers/CustomersPage";
import UsersPage from "./pages/users/UsersPage";
import WebsiteSettingsPage from "./pages/website/WebsiteSettingsPage";
import FaqsPage from "./pages/website/FaqsPage";
import StaticPagesPage from "./pages/website/StaticPagesPage";
import BackupPage from "./pages/backup/BackupPage";
import AuditLogsPage from "./pages/audit/AuditLogsPage";
import PosQrRecoveryPage from "./pages/posQr/PosQrRecoveryPage";

import { CartProvider } from "./pages/customer/cartcontext";
import { CustomCartProvider } from "./pages/customer/customcartcontext";
import CustomerLayout from "./pages/customer/customerlayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ForcePasswordChangePage from "./pages/ForcePasswordChangePage.jsx";
import RegisterPage from "./pages/customer/registerpage";
import ForgotPasswordPage from "./pages/customer/forgotpasswordpage";
import ProductCatalog from "./pages/customer/productcatalog";
import CartPage from "./pages/customer/cartpage";
import CustomCartPage from "./pages/customer/customcartpage";
import CheckoutPage from "./pages/customer/checkoutpage";
import OrderCompletePage from "./pages/customer/OrderCompletePage.jsx";
import CustomizePage from "./pages/customer/customizepage";
import CustomCheckoutPage from "./pages/customer/customcheckoutpage";
import CustomRequestDetailPage from "./pages/customer/customrequestdetailpage";
import CustomerBlueprintReceiptPage from "./pages/customer/CustomerBlueprintReceiptPage";
import CustomerStandardReceiptPage from "./pages/customer/CustomerStandardReceiptPage";
import AppointmentPage from "./pages/customer/appointmentpage";
import OrdersPageCustomer from "./pages/customer/orderspage";
import WarrantyPageCustomer from "./pages/customer/warrantypage";
import ProfileSettings from "./pages/customer/profilesettings";
import LandingPage from "./pages/customer/LandingPage";
import VerifyOtpPage from "./pages/customer/verifyotppage";
import PhoneOtpPage from "./pages/customer/phoneotppage";
import ResetPasswordPage from "./pages/customer/resetpasswordpage";
import PendingApprovalPage from "./pages/customer/pendingapprovalpage";
import TermsPage from "./pages/customer/TermsPage";
import PrivacyPolicyPage from "./pages/customer/PrivacyPolicyPage";
import CustomerStaticPage from "./pages/customer/customerstaticpage";
import SupportPage from "./pages/customer/supportpage";
import AdminSupportPage from "./pages/support/SupportPage";
import ARViewPage from "./pages/customer/ar/ARViewPage";
import ProtectedRoute from "./components/ProtectedRoute";

import POSLayout from "./pages/staff/POSLayout.jsx";
import POSDashboard from "./pages/staff/Dashboard";
import POSProductSearch from "./pages/staff/ProductSearch";
import POSProcessOrder from "./pages/staff/ProcessOrder";
import QrPaymentReturn from "./pages/staff/QrPaymentReturn";
import POSDeliveryScheduling from "./pages/staff/DeliveryScheduling";
import POSDeliveryManagement from "./pages/staff/DeliveryManagement";
import POSAppointmentScheduling from "./pages/staff/AppointmentScheduling";
import POSReceiptPage from "./pages/staff/ReceiptPage";
import BlueprintReceiptPage from "./pages/staff/BlueprintReceiptPage";
import POSSalesReports from "./pages/staff/SalesReports";
import POSBlueprintView from "./pages/staff/BlueprintView";
import BlueprintPayments from "./pages/staff/BlueprintPayments";
import POSInventoryLookup from "./pages/staff/InventoryLookup";
import POSOrderHistory from "./pages/staff/OrderHistory";
import RiderDashboard from "./pages/staff/RiderDashboard";
import RiderHistory from "./pages/staff/RiderHistory";
import StaffSupportPage from "./pages/staff/SupportPage";

window.addEventListener("error", (e) => {
  if (
    e.message === "ResizeObserver loop limit exceeded" ||
    e.message ===
      "ResizeObserver loop completed with undelivered notifications."
  ) {
    e.stopImmediatePropagation();
  }
});

function RequireAuth({ children, roles }) {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  const internalMustChange =
    (user.role === "admin" || user.role === "staff") &&
    Number(user.must_change_password) === 1;

  if (
    internalMustChange &&
    location.pathname !== "/change-temporary-password"
  ) {
    return <Navigate to="/change-temporary-password" replace />;
  }

  return children;
}

function RequirePermission({ permission, children }) {
  return (
    <ProtectedRoute requiredPermission={permission}>{children}</ProtectedRoute>
  );
}

function RequireStaffType({ children, allowedTypes }) {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "admin") {
    return children;
  }

  if (user.role !== "staff") {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  if (!allowedTypes.includes(user.staff_type)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  return children;
}

function RequireStaffOnlyType({ children, allowedTypes }) {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "staff") {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  if (!allowedTypes.includes(user.staff_type)) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  return children;
}

function getDefaultRouteForUser(user) {
  if (!user) {
    return "/login";
  }

  if (
    (user.role === "admin" || user.role === "staff") &&
    Number(user.must_change_password) === 1
  ) {
    return "/change-temporary-password";
  }

  if (user.role === "admin") {
    return "/admin/dashboard";
  }

  if (user.role === "staff") {
    if (user.staff_type === "delivery_rider") {
      return "/staff/rider-dashboard";
    }

    if (user.staff_type === "cashier") {
      return "/staff/order";
    }

    return "/staff/dashboard";
  }

  return "/";
}

function RedirectIfAuthenticated({ children }) {
  const { user } = useAuthStore();

  if (user) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  return children;
}

function BlockNonCustomerPortal({ children }) {
  const { user } = useAuthStore();

  if (!user) {
    return children;
  }

  if (user.role !== "customer") {
    return <Navigate to={getDefaultRouteForUser(user)} replace />;
  }

  return children;
}

/* WISDOM CUSTOM DESIGN EDIT ROUTE + REVIEW CLEANUP V1.0.2 */
function CustomCartEditRoute() {
  const [searchParams] = useSearchParams();
  const editKey = String(searchParams.get("edit") || "").trim();

  if (!editKey) {
    return <Navigate to="/cart" replace />;
  }

  return (
    <RequireAuth roles={["customer"]}>
      <CustomCartPage />
    </RequireAuth>
  );
}

export default function App() {
  useEffect(() => {
    api
      .get("/website/settings")
      .then((res) => {
        // 1. Change the Browser Tab Title
        if (res.data?.display?.site_name) {
          document.title = res.data.display.site_name;
        }

        // 2. Change the Browser Tab Logo
        if (res.data?.display?.site_logo) {
          const faviconUrl = buildAssetUrl(res.data.display.site_logo);
          let link = document.querySelector("link[rel~='icon']");
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = faviconUrl;
        }
      })
      .catch((err) => console.error("Failed to load global tab settings", err));
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <CartProvider>
          <CustomCartProvider>
            <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
            <SessionLoginFeedback />

            <Routes>
              <Route path="/ar/:sessionId" element={<ARViewPage />} />

              <Route
                path="/change-temporary-password"
                element={
                  <RequireAuth roles={["admin", "staff"]}>
                    <ForcePasswordChangePage />
                  </RequireAuth>
                }
              />

              {/* CUSTOMER PORTAL */}
              <Route element={<Outlet />}>
                <Route
                  path="/"
                  element={
                    <BlockNonCustomerPortal>
                      <CustomerLayout />
                    </BlockNonCustomerPortal>
                  }
                >
                  <Route index element={<LandingPage />} />

                  <Route
                    path="login"
                    element={
                      <RedirectIfAuthenticated>
                        <LoginPage />
                      </RedirectIfAuthenticated>
                    }
                  />

                  <Route
                    path="register"
                    element={
                      <RedirectIfAuthenticated>
                        <RegisterPage />
                      </RedirectIfAuthenticated>
                    }
                  />

                  <Route
                    path="forgot-password"
                    element={
                      <RedirectIfAuthenticated>
                        <ForgotPasswordPage />
                      </RedirectIfAuthenticated>
                    }
                  />

                  <Route
                    path="reset-password"
                    element={
                      <RedirectIfAuthenticated>
                        <ResetPasswordPage />
                      </RedirectIfAuthenticated>
                    }
                  />

                  <Route path="terms" element={<TermsPage />} />
                  <Route path="privacy" element={<PrivacyPolicyPage />} />
                  <Route path="verify-otp" element={<VerifyOtpPage />} />
                  <Route path="phone-otp" element={<PhoneOtpPage />} />

                  <Route
                    path="pending-approval"
                    element={<PendingApprovalPage />}
                  />

                  <Route
                    path="about"
                    element={<CustomerStaticPage slug="about_us" />}
                  />
                  <Route
                    path="contact"
                    element={<CustomerStaticPage slug="contact" />}
                  />
                  <Route
                    path="faq"
                    element={<CustomerStaticPage slug="faq" />}
                  />

                  <Route path="catalog" element={<ProductCatalog />} />
                  <Route path="cart" element={<CartPage />} />
                  <Route path="customize" element={<CustomizePage />} />

                  <Route path="custom-cart" element={<CustomCartEditRoute />} />

                  <Route
                    path="checkout"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <CheckoutPage />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="order-complete"
                    element={<OrderCompletePage />}
                  />

                  <Route
                    path="custom-checkout"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <CustomCheckoutPage />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="custom-requests/:id"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <CustomRequestDetailPage />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="custom-requests/:id/receipts/:receiptId"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <CustomerBlueprintReceiptPage />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="appointment"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <AppointmentPage />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="orders"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <OrdersPageCustomer />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="orders/:id/receipts/:receiptId"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <CustomerStandardReceiptPage />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="warranty"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <WarrantyPageCustomer />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="support"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <SupportPage />
                      </RequireAuth>
                    }
                  />

                  <Route
                    path="profilesettings"
                    element={
                      <RequireAuth roles={["customer"]}>
                        <ProfileSettings />
                      </RequireAuth>
                    }
                  />
                </Route>
              </Route>

              {/* ADMIN PORTAL */}
              <Route
                path="/admin"
                element={
                  <RequireAuth roles={["admin", "staff"]}>
                    <AdminLayout />
                  </RequireAuth>
                }
              >
                <Route
                  path="tasks"
                  element={
                    <RequirePermission permission="task_assignments.view">
                      <TasksPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="appointments"
                  element={
                    <RequirePermission permission="appointments.view">
                      <POSAppointmentScheduling />
                    </RequirePermission>
                  }
                />

                <Route
                  path="delivery"
                  element={
                    <RequirePermission permission="delivery_scheduling.view">
                      <POSDeliveryScheduling />
                    </RequirePermission>
                  }
                />

                <Route index element={<Navigate to="dashboard" replace />} />
                <Route
                  path="dashboard"
                  element={
                    <RequirePermission permission="dashboard.view">
                      <DashboardPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="products"
                  element={
                    <RequirePermission permission="products.view">
                      <ProductsPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="products/:id/edit"
                  element={
                    <RequirePermission permission="products.edit">
                      <ProductFormPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="inventory/raw"
                  element={
                    <RequirePermission permission="raw_materials.view">
                      <RawMaterialsPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="inventory/build"
                  element={
                    <RequirePermission permission="build_materials.view">
                      <BuildMaterialsPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="/admin/inventory/build/new"
                  element={
                    <RequirePermission permission="build_materials.create">
                      <BuildMaterialFormPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="inventory/build/:id/edit"
                  element={
                    <RequirePermission permission="build_materials.edit">
                      <BuildMaterialFormPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="inventory/movements"
                  element={
                    <RequirePermission permission="stock_movements.view">
                      <StockMovementPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="inventory/physical-inventory"
                  element={
                    <RequirePermission permission="stock_movements.view">
                      <PhysicalInventoryPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="inventory/transfers"
                  element={
                    <RequirePermission permission="stock_movements.manage">
                      <StockTransferPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="inventory/suppliers"
                  element={
                    <RequirePermission permission="suppliers.view">
                      <SuppliersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="blueprints"
                  element={
                    <RequirePermission permission="blueprint_management.view">
                      <BlueprintsPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="blueprints/:id/design"
                  element={
                    <RequirePermission permission="blueprint_management.edit">
                      <BlueprintDesign />
                    </RequirePermission>
                  }
                />

                <Route
                  path="blueprints/:id/estimation"
                  element={
                    <RequirePermission permission="blueprint_management.edit">
                      <EstimationPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="contracts"
                  element={
                    <RequirePermission permission="contracts.view">
                      <ContractsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="orders"
                  element={
                    <RequirePermission permission="orders.view">
                      <OrdersPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="orders/:id"
                  element={
                    <RequirePermission permission="orders.view">
                      <OrderDetailPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="orders/cancellations"
                  element={
                    <RequirePermission permission="cancellations_refunds.view">
                      <CancellationsPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="reports/current-inventory"
                  element={
                    <RequirePermission permission="stock_movements.view">
                      <CurrentInventoryReportPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="reports/daily-stock-in"
                  element={
                    <RequirePermission permission="stock_movements.view">
                      <DailyStockInReportPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="sales"
                  element={
                    <RequirePermission permission="sales_report.view">
                      <SalesReportPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="pos-qr-recovery"
                  element={
                    <RequirePermission permission="pos_qr_recovery.view">
                      <PosQrRecoveryPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="warranty"
                  element={
                    <RequirePermission permission="warranty.view">
                      <WarrantyPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="support"
                  element={
                    <RequirePermission permission="support.view">
                      <AdminSupportPage />
                    </RequirePermission>
                  }
                />
<<<<<<< HEAD
=======
                <Route
                  path="reports/deliveries"
                  element={<DeliveryReportPage />}
                />
                <Route path="sales" element={<SalesReportPage />} />
                <Route path="pos-qr-recovery" element={<PosQrRecoveryPage />} />
                <Route path="warranty" element={<WarrantyPage />} />
                <Route path="support" element={<AdminSupportPage />} />
>>>>>>> e303bc81d7e73c9629773cf7ed159a340d6192a6

                <Route
                  path="customers"
                  element={
                    <RequirePermission permission="customers.view">
                      <CustomersPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="users"
                  element={
                    <RequirePermission permission="users.view">
                      <UsersPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="website/settings"
                  element={
                    <RequirePermission permission="site_settings.view">
                      <WebsiteSettingsPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="website/faqs"
                  element={
                    <RequirePermission permission="faqs.view">
                      <FaqsPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="website/pages"
                  element={
                    <RequirePermission permission="page_content.view">
                      <StaticPagesPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="backup"
                  element={
                    <RequirePermission permission="backup.view">
                      <BackupPage />
                    </RequirePermission>
                  }
                />

                <Route
                  path="audit-logs"
                  element={
                    <RequirePermission permission="audit_logs.view">
                      <AuditLogsPage />
                    </RequirePermission>
                  }
                />
              </Route>

              {/* STAFF PORTAL */}
              <Route
                path="/staff"
                element={
                  <RequireAuth roles={["admin", "staff"]}>
                    <POSLayout />
                  </RequireAuth>
                }
              >
                <Route
                  path="rider-dashboard"
                  element={
                    <RequireStaffType allowedTypes={["delivery_rider"]}>
                      <RiderDashboard />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="rider-history"
                  element={
                    <RequireStaffType allowedTypes={["delivery_rider"]}>
                      <RiderHistory />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="dashboard"
                  element={
                    <RequireStaffType allowedTypes={["indoor"]}>
                      <POSDashboard />
                    </RequireStaffType>
                  }
                />

                <Route
                  index
                  element={
                    <Navigate
                      to={getDefaultRouteForUser(useAuthStore.getState().user)}
                      replace
                    />
                  }
                />

                <Route
                  path="products"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSProductSearch />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="tasks"
                  element={
                    <RequireStaffType allowedTypes={["indoor"]}>
                      <MyTasks />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="tasks/:orderId/blueprint"
                  element={
                    <RequireStaffType allowedTypes={["indoor"]}>
                      <ProductionBlueprintView />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="order"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSProcessOrder />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="pos/qr-payments/:id"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <QrPaymentReturn />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="history"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSOrderHistory />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="support"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <StaffSupportPage />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="blueprint-payments"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <BlueprintPayments />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="delivery"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <POSDeliveryScheduling />
                    </RequireAuth>
                  }
                />

                <Route
                  path="deliveries"
                  element={
                    <RequireStaffType allowedTypes={["delivery_rider"]}>
                      <POSDeliveryManagement />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="appointment"
                  element={
                    <RequireStaffOnlyType allowedTypes={["indoor"]}>
                      <POSAppointmentScheduling />
                    </RequireStaffOnlyType>
                  }
                />

                <Route
                  path="receipt/:id"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSReceiptPage />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="blueprint-receipt/:id"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <BlueprintReceiptPage />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="reports"
                  element={
                    <RequireStaffType allowedTypes={["cashier"]}>
                      <POSSalesReports />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="inventory"
                  element={
                    <RequireStaffType allowedTypes={["indoor"]}>
                      <POSInventoryLookup />
                    </RequireStaffType>
                  }
                />

                <Route
                  path="blueprints"
                  element={
                    <RequireAuth roles={["admin"]}>
                      <POSBlueprintView />
                    </RequireAuth>
                  }
                />

                {/*Staff + manager authority*/}
                <Route
                  path="/staff/admin/dashboard"
                  element={
                    <RequirePermission permission="dashboard.view">
                      <DashboardPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/products"
                  element={
                    <RequirePermission permission="products.view">
                      <ProductsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/inventory/raw"
                  element={
                    <RequirePermission permission="raw_materials.view">
                      <RawMaterialsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/inventory/build"
                  element={
                    <RequirePermission permission="build_materials.view">
                      <BuildMaterialsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/suppliers"
                  element={
                    <RequirePermission permission="suppliers.view">
                      <SuppliersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/stock-movements"
                  element={
                    <RequirePermission permission="stock_movements.view">
                      <StockMovementPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/stock-transfer"
                  element={
                    <RequirePermission permission="stock_movements.manage">
                      <StockTransferPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/physical-inventory"
                  element={
                    <RequirePermission permission="stock_movements.view">
                      <PhysicalInventoryPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/orders"
                  element={
                    <RequirePermission permission="orders.view">
                      <OrdersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/orders/cancellations"
                  element={
                    <RequirePermission permission="cancellations_refunds.view">
                      <CancellationsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/tasks"
                  element={
                    <RequirePermission permission="task_assignments.view">
                      <TasksPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/appointments"
                  element={
                    <RequirePermission permission="appointments.view">
                      <POSAppointmentScheduling />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/delivery"
                  element={
                    <RequirePermission permission="delivery_scheduling.view">
                      <POSDeliveryScheduling />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/blueprints"
                  element={
                    <RequirePermission permission="blueprint_management.view">
                      <BlueprintsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/contracts"
                  element={
                    <RequirePermission permission="contracts.view">
                      <ContractsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/warranty"
                  element={
                    <RequirePermission permission="warranty.view">
                      <WarrantyPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/sales"
                  element={
                    <RequirePermission permission="sales_report.view">
                      <SalesReportPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/customers"
                  element={
                    <RequirePermission permission="customers.view">
                      <CustomersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/users"
                  element={
                    <RequirePermission permission="users.view">
                      <UsersPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/audit-logs"
                  element={
                    <RequirePermission permission="audit_logs.view">
                      <AuditLogsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/website/settings"
                  element={
                    <RequirePermission permission="site_settings.view">
                      <WebsiteSettingsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/website/faqs"
                  element={
                    <RequirePermission permission="faqs.view">
                      <FaqsPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/website/pages"
                  element={
                    <RequirePermission permission="page_content.view">
                      <StaticPagesPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/staff/admin/backup"
                  element={
                    <RequirePermission permission="backup.view">
                      <BackupPage />
                    </RequirePermission>
                  }
                />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/catalog" replace />} />
            </Routes>
          </CustomCartProvider>
        </CartProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
