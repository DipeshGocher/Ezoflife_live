import AdminUserHistory from '../pages/AdminUserHistory';
import AdminAuditHistory from '../pages/AdminAuditHistory';
import React from 'react';
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import AdminLayout from '../layouts/AdminLayout';

// Pages
import Dashboard from '../pages/Dashboard';
import Orders from '../pages/Orders';
import Vendors from '../pages/Vendors';
import OnboardingApprovals from '../pages/OnboardingApprovals';
import Payouts from '../pages/Payouts';
import Services from '../pages/Services';
import Users from '../pages/Users';
import AdminLogin from '../pages/AdminLogin';
import AdminOtp from '../pages/AdminOtp';
import AdminOrderDetail from '../pages/AdminOrderDetail';
import AdminVendorDetail from '../pages/AdminVendorDetail';
import PricingConfig from '../pages/PricingConfig';
import HelpDesk from '../pages/HelpDesk';
import DisputeCenter from '../pages/DisputeCenter';
import MaterialConfig from '../pages/MaterialConfig';
import FAQManagement from '../pages/FAQManagement';
import FeedbackManagement from '../pages/FeedbackManagement';
import MediaConfig from '../pages/MediaConfig';
import PartnershipInquiries from '../pages/PartnershipInquiries';
import LaborManagement from '../pages/LaborManagement';
import NotificationsPage from '../pages/NotificationsPage';
import CareerModeration from '../pages/CareerModeration';
import RoleDetails from '../pages/RoleDetails';
import Suppliers from '../pages/Suppliers';
import AdminAdvertisementPage from '../pages/AdminAdvertisementPage';
import B2BEscrowManagement from '../pages/B2BEscrowManagement';
import AdminLegalPage from '../pages/AdminLegalPage';
import ServiceAreas from '../pages/ServiceAreas';
import AdminSupplierRequestsPage from '../pages/AdminSupplierRequestsPage';
import AdminSupplierRequestDetailPage from '../pages/AdminSupplierRequestDetailPage';
import AdminVendorRequestDetailPage from '../pages/AdminVendorRequestDetailPage';
import AdminBrandInquiries from '../pages/AdminBrandInquiries';
import VendorServiceRequests from '../pages/VendorServiceRequests';
import SupplierProductRequests from '../pages/SupplierProductRequests';
import AdminPromotions from '../pages/AdminPromotions';
import AdminCreatePromotion from '../pages/AdminCreatePromotion';
import AdminPromotionTable from '../pages/AdminPromotionTable';
import AdminGeofencePromotion from '../pages/AdminGeofencePromotion';

import MasterServiceManagement from '../pages/MasterServiceManagement';
import CategoryManagement from '../pages/CategoryManagement';
import VendorSupplyCategoryManagement from '../pages/VendorSupplyCategoryManagement';
import VendorMasterSupplyManagement from '../pages/VendorMasterSupplyManagement';
import VendorProductTableManagement from '../pages/VendorProductTableManagement';
import SupplierServiceZoneManagement from '../pages/SupplierServiceZoneManagement';


import ServiceGeofenceTable from '../pages/ServiceGeofenceTable';
import GeofencePincodeMapping from '../pages/GeofencePincodeMapping';
import PricingPreview from '../pages/PricingPreview';
import AreaPricingOverrides from '../pages/AreaPricingOverrides';
import CustomerPayments from '../pages/CustomerPayments';
import AdminInvoiceSettings from '../pages/AdminInvoiceSettings';
import ReferralManagement from '../pages/ReferralManagement';
import AdminSettings from '../pages/AdminSettings';
import MasterPricingRegistry from '../pages/MasterPricingRegistry';
import AdminRolesManagement from '../pages/AdminRolesManagement';
import AdminActivate from '../pages/AdminActivate';

// Simple Guard Component
const AdminGuard = ({ children }) => {
  const isAuth = localStorage.getItem('adminAuth') === 'true';
  const token = localStorage.getItem('adminToken');
  const adminDataStr = localStorage.getItem('adminData');
  const location = useLocation();
  
  let isValid = false;
  if (isAuth && token && adminDataStr) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        // Decode base64 payload
        const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr);
        const now = Math.floor(Date.now() / 1000);
        
        // Parse adminData
        const adminData = JSON.parse(adminDataStr);
        
        // Check that role is Admin and token is not expired
        if (
          payload.role === 'Admin' && 
          adminData.role === 'Admin' && 
          (!payload.exp || payload.exp > now)
        ) {
          isValid = true;
        }
      }
    } catch (e) {
      console.error('Error validating admin credentials', e);
    }
  }

  console.log(`🔐 AdminGuard Path Check: ${location.pathname} | isValid: ${isValid}`);

  if (!isValid) {
    // Clear storage on invalid validation
    localStorage.removeItem('adminAuth');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return children;
};

const AdminRoutes = () => {
  return (
    <Routes>
      {/* Public Admin Routes */}
      <Route path="/login" element={<AdminLogin />} />
      <Route path="/otp" element={<AdminOtp />} />
      <Route path="/activate" element={<AdminActivate />} />

      {/* Protected Admin Routes */}
      <Route 
        element={
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        }
      >
        <Route path="/ads" element={<AdminAdvertisementPage />} />
        <Route path="/advertise" element={<AdminBrandInquiries />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/vendor-ranking" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/operations" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/reports" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<AdminOrderDetail />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/vendors/:id" element={<AdminVendorDetail />} />
        <Route path="/vendors/approvals" element={<OnboardingApprovals />} />
        <Route path="/vendors/requests/:id" element={<AdminVendorRequestDetailPage />} />
        <Route path="/vendor-service-requests" element={<VendorServiceRequests />} />
        <Route path="/supplier-product-requests" element={<SupplierProductRequests />} />
        <Route path="/pricing" element={<PricingConfig />} />
        <Route path="/services" element={<Services />} />
        <Route path="/master-services" element={<MasterServiceManagement />} />
        <Route path="/help-desk" element={<HelpDesk />} />
        <Route path="/dispute-center" element={<DisputeCenter />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/roles" element={<AdminRolesManagement />} />
        <Route path="/b2b-escrow" element={<B2BEscrowManagement />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/materials" element={<MaterialConfig />} />
        <Route path="/faqs" element={<FAQManagement />} />
        <Route path="/media" element={<MediaConfig />} />
        <Route path="/partnerships" element={<PartnershipInquiries />} />
        <Route path="/careers" element={<CareerModeration creatorFilter="Admin" />} />
        <Route path="/careers/admin-posts" element={<CareerModeration creatorFilter="Admin" />} />
        <Route path="/careers/vendor-posts" element={<CareerModeration creatorFilter="Vendor" />} />
        <Route path="/careers/supplier-posts" element={<CareerModeration creatorFilter="Supplier" />} />
        <Route path="/careers/role-details" element={<RoleDetails />} />
        <Route path="/categories" element={<CategoryManagement />} />
        <Route path="/vendor-supply-pricing/categories" element={<VendorSupplyCategoryManagement />} />
        <Route path="/vendor-supply-pricing/supplies" element={<VendorMasterSupplyManagement />} />
        <Route path="/vendor-supply-pricing/products" element={<VendorProductTableManagement />} />
        <Route path="/vendor-supply-pricing/zones" element={<SupplierServiceZoneManagement />} />


        <Route path="/privacy-policy" element={<AdminLegalPage type="privacy-policy" />} />
        <Route path="/terms-conditions" element={<AdminLegalPage type="terms-conditions" />} />
        <Route path="/geofencing" element={<ServiceAreas />} />
        <Route path="/geofence-table" element={<ServiceGeofenceTable />} />
        <Route path="/geofence-pincode-mapping" element={<GeofencePincodeMapping />} />
        <Route path="/pricing-preview" element={<PricingPreview />} />
        <Route path="/pricing-overrides" element={<AreaPricingOverrides />} />
        <Route path="/master-pricing" element={<MasterPricingRegistry />} />
        <Route path="/feedback" element={<FeedbackManagement />} />
        <Route path="/supplier-requests" element={<AdminSupplierRequestsPage />} />
        <Route path="/supplier-requests/:id" element={<AdminSupplierRequestDetailPage />} />
        <Route path="/users/:id/history" element={<AdminUserHistory />} />
        <Route path="/audit-history" element={<AdminAuditHistory />} />
        <Route path="/invoice-settings" element={<AdminInvoiceSettings />} />
        <Route path="/referral-settings" element={<ReferralManagement />} />
        <Route path="/promotions" element={<AdminPromotions />} />
        <Route path="/create-promotion" element={<AdminCreatePromotion />} />
        <Route path="/promotion-table" element={<AdminPromotionTable />} />
        <Route path="/geofence-promotion" element={<AdminGeofencePromotion />} />
        <Route path="/settings" element={<AdminSettings />} />

        <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />

      </Route>

      {/* Default Redirect */}
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
};

export default AdminRoutes;
