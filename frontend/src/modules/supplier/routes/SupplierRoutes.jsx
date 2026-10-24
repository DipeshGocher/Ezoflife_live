import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import SupplierDashboard from "../pages/SupplierDashboard";
import SupplierOrderDetails from "../pages/SupplierOrderDetails";
import SupplierSupplies from "../pages/SupplierSupplies";
import SupplierMySupplies from "../pages/SupplierMySupplies";
import SupplierFulfillmentPage from "../pages/SupplierFulfillmentPage";
import SupplierLogistics from "../pages/SupplierLogistics";
import SupplierWallet from "../pages/SupplierWallet";
import SupplierLayout from "../layouts/SupplierLayout";
import SupplierProfile from "../pages/SupplierProfile";
import SupplierMorePage from "../pages/SupplierMorePage";
import SupplierLaborRequestPage from "../pages/SupplierLaborRequestPage";
import SupplierCreateJobRequisition from "../pages/SupplierCreateJobRequisition";
import SupplierAddressesPage from "../pages/SupplierAddressesPage";
import SupplierNotifications from "../pages/SupplierNotifications";
import SupplierInsights from "../pages/SupplierInsights";

import SupplierAuth from "../pages/SupplierAuth";
import SupplierOtp from "../pages/SupplierOtp";
import PrivacyPolicyPage from "../../user/pages/PrivacyPolicyPage";
import TermsConditionsPage from "../../user/pages/TermsConditionsPage";

const SupplierRoutes = () => {
  return (
    <Routes>
      <Route element={<SupplierLayout />}>
        {/* Auth Flow */}
        <Route path="/auth" element={<SupplierAuth />} />
        <Route path="/otp" element={<SupplierOtp />} />

        {/* Main Hub */}
        <Route path="/dashboard" element={<SupplierDashboard />} />
        <Route path="/notifications" element={<SupplierNotifications />} />
        <Route path="/order/:id" element={<SupplierOrderDetails />} />
        <Route path="/supplies" element={<SupplierSupplies />} />
        <Route path="/my-supplies" element={<SupplierMySupplies />} />
        <Route path="/fulfillment/:id" element={<SupplierFulfillmentPage />} />
        <Route path="/logistics" element={<SupplierLogistics />} />
        <Route path="/wallet" element={<SupplierWallet />} />
        <Route path="/profile" element={<SupplierProfile />} />
        <Route path="/addresses" element={<SupplierAddressesPage />} />
        <Route path="/more" element={<SupplierMorePage />} />
        <Route path="/insights" element={<SupplierInsights />} />
        <Route path="/labor-request" element={<SupplierLaborRequestPage />} />
        <Route
          path="/labor-request/create"
          element={<SupplierCreateJobRequisition />}
        />

        {/* Default redirect to dashboard */}
        <Route
          path="*"
          element={<Navigate to="/supplier/dashboard" replace />}
        />
      </Route>

      {/* Independent Standalone Legal Routes under /supplier/ */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsConditionsPage />} />
      <Route path="/terms-conditions" element={<TermsConditionsPage />} />
      <Route path="/terms-and-conditions" element={<TermsConditionsPage />} />
    </Routes>
  );
};

export default SupplierRoutes;
