import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";

// Auth flow
import VendorAuth from "../pages/VendorAuth";
import VendorOtp from "../pages/VendorOtp";

// Registration flow
import ShopDetails from "../pages/ShopDetails";
import DocumentUpload from "../pages/DocumentUpload";
import ApprovalPending from "../pages/ApprovalPending";

// Main app pages
import Dashboard from "../pages/Dashboard";
import OrderDetails from "../pages/OrderDetails";
import Earnings from "../pages/Earnings";
import ServiceManagement from "../pages/ServiceManagement";
import AddServicePage from "../pages/AddServicePage";
import PayoutSettings from "../pages/PayoutSettings";
import VendorProfile from "../pages/VendorProfile";
import VendorNotifications from "../pages/VendorNotifications";
import VendorMorePage from "../pages/VendorMorePage";
import VendorOrderHistory from "../pages/VendorOrderHistory";
import WalkInOrderPage from "../pages/WalkInOrderPage";
import PromotionManagerPage from "../pages/PromotionManagerPage";
import B2BFulfillmentPage from "../pages/B2BFulfillmentPage";
import B2BOrderHistory from "../pages/B2BOrderHistory";
import VendorReviews from "../pages/VendorReviews";
import JobManagerPage from "../pages/JobManagerPage";
import MaterialRequestPage from "../pages/MaterialRequestPage";
import LaborRequestPage from "../pages/LaborRequestPage";
import CreateJobRequisition from "../pages/CreateJobRequisition";
import VendorMyServices from "../pages/VendorMyServices";
import VendorReports from "../pages/VendorReports";
import VendorProductImages from "../pages/VendorProductImages";
import VendorCartDetailsPage from "../pages/VendorCartDetailsPage";
import VendorProductQueries from "../pages/VendorProductQueries";
import VendorProductQueryChat from "../pages/VendorProductQueryChat";
import B2BOrderTrackingPage from "../pages/B2BOrderTrackingPage";
import VendorOrderChatPage from "../pages/VendorOrderChatPage";

// Profile sub-pages
import EditProfile from "../pages/EditProfile";
import Support from "../pages/Support";
import VendorPrivacyPolicy from "../pages/VendorPrivacyPolicy";
import VendorTermsConditions from "../pages/VendorTermsConditions";
import RejectedServices from "../pages/RejectedServices";
import VendorAddressesPage from "../pages/VendorAddressesPage";
import PrivacyPolicyPage from "../../user/pages/PrivacyPolicyPage";
import TermsConditionsPage from "../../user/pages/TermsConditionsPage";

import VendorLayout from "../layouts/VendorLayout";

const VendorRoutes = () => {
  return (
    <Routes>
      <Route element={<VendorLayout />}>
        {/* Auth Flow */}
        <Route path="/splash" element={<Navigate to="/vendor/auth" replace />} />
        <Route path="/auth" element={<VendorAuth />} />
        <Route path="/otp" element={<VendorOtp />} />

        {/* Registration Flow */}
        <Route path="/register" element={<ShopDetails />} />
        <Route path="/upload-documents" element={<DocumentUpload />} />
        <Route path="/approval-pending" element={<ApprovalPending />} />

        {/* Main App */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/order/:id" element={<OrderDetails />} />
        <Route path="/order-chat/:orderId" element={<VendorOrderChatPage />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/services" element={<ServiceManagement />} />
        <Route path="/my-services" element={<VendorMyServices />} />
        <Route path="/services/add" element={<AddServicePage />} />
        <Route path="/payouts" element={<PayoutSettings />} />
        <Route path="/profile" element={<VendorProfile />} />
        <Route path="/notifications" element={<VendorNotifications />} />
        <Route path="/more" element={<VendorMorePage />} />
        <Route path="/reports" element={<VendorReports />} />
        <Route path="/order-history" element={<VendorOrderHistory />} />

        {/* Sprint 3: Operational Hub */}
        <Route path="/walk-in" element={<WalkInOrderPage />} />
        <Route path="/promotions" element={<PromotionManagerPage />} />
        <Route path="/fulfillment" element={<B2BFulfillmentPage />} />
        <Route path="/material-request" element={<MaterialRequestPage />} />
        <Route
          path="/material-request/track/:id"
          element={<B2BOrderTrackingPage />}
        />
        <Route path="/cart-details" element={<VendorCartDetailsPage />} />
        <Route path="/labor-request" element={<LaborRequestPage />} />
        <Route
          path="/labor-request/create"
          element={<CreateJobRequisition />}
        />
        <Route path="/material-orders" element={<B2BOrderHistory />} />
        <Route path="/reviews" element={<VendorReviews />} />
        <Route path="/jobs" element={<JobManagerPage />} />
        <Route path="/product-images" element={<VendorProductImages />} />
        <Route path="/product-queries" element={<VendorProductQueries />} />
        <Route
          path="/product-queries/:supplierId"
          element={<VendorProductQueryChat />}
        />

        {/* Profile Sub-pages */}
        <Route path="/edit-profile" element={<EditProfile />} />
        <Route path="/support" element={<Support />} />
        <Route path="/privacy-policy" element={<VendorPrivacyPolicy />} />
        <Route path="/terms-conditions" element={<VendorTermsConditions />} />
        <Route path="/rejected-services" element={<RejectedServices />} />
        <Route path="/addresses" element={<VendorAddressesPage />} />

        {/* Default */}
        <Route path="*" element={<Navigate to="/vendor/splash" replace />} />
      </Route>

      {/* Independent Standalone Legal Routes under /vendor/ */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsConditionsPage />} />
    </Routes>
  );
};

export default VendorRoutes;
