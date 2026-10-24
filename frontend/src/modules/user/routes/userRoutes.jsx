import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import AppEntryRedirect from '../pages/AppEntryRedirect';
import AuthPage from '../pages/AuthPage';
import OtpVerificationPage from '../pages/OtpVerificationPage';
import HomePage from '../pages/HomePage';
import CartPage from '../pages/CartPage';
import SuccessPage from '../pages/SuccessPage';
import OrderConfirmationPage from '../pages/OrderConfirmationPage';
import OrderTrackingPage from '../pages/OrderTrackingPage';
import DeliveryVerificationPage from '../pages/DeliveryVerificationPage';
import SuccessFeedbackPage from '../pages/SuccessFeedbackPage';
import OrdersHistoryPage from '../pages/OrdersHistoryPage';
import UserProfilePage from '../pages/UserProfilePage';
import MoreMenuPage from '../pages/MoreMenuPage';
import EditProfilePage from '../pages/EditProfilePage';
import ProfileCreationPage from '../pages/ProfileCreationPage';
import AddressesPage from '../pages/AddressesPage';
import PaymentMethodsPage from '../pages/PaymentMethodsPage';
import HelpCenterPage from '../pages/HelpCenterPage';
import PrivacyPolicyPage from '../pages/PrivacyPolicyPage';
import RateAndReviewPage from '../pages/RateAndReviewPage';
import NotificationsPage from '../pages/NotificationsPage';
import AllServicesPage from '../pages/AllServicesPage';
import SearchResultsPage from '../pages/SearchResultsPage';
import ServiceInfoPage from '../pages/ServiceInfoPage';
import TermsConditionsPage from '../pages/TermsConditionsPage';
import CareersPage from '../pages/CareersPage';
import FAQPage from '../pages/FAQPage';
import ChatPage from '../pages/ChatPage';
import PartnershipInquiryPage from '../pages/PartnershipInquiryPage';
import AdvertiseWithUsPage from '../pages/AdvertiseWithUsPage';
import WalletPage from '../pages/WalletPage';
import RegisterAsVendorPage from '../pages/RegisterAsVendorPage';
import MaterialsCatalogPage from '../pages/MaterialsCatalogPage';
import SupportTicketsPage from '../pages/SupportTicketsPage';
import FeedbackForm from '../pages/FeedbackForm';
import RegisterAsSupplierPage from '../pages/RegisterAsSupplierPage';
import SupplierProductSelectionPage from '../pages/SupplierProductSelectionPage';


import UserLayout from '../layouts/UserLayout';
import ServiceImageUploadPage from '../pages/ServiceImageUploadPage';
import ReferralPage from '../pages/ReferralPage';

const UserRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<AppEntryRedirect />} />
      <Route path="/land" element={<AppEntryRedirect />} />
      
      <Route element={<UserLayout />}>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/otp" element={<OtpVerificationPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/confirmation" element={<OrderConfirmationPage />} />
        <Route path="/chat/:orderId" element={<ChatPage />} />
        <Route path="/partnerships" element={<PartnershipInquiryPage />} />
        <Route path="/advertise" element={<AdvertiseWithUsPage />} />
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/tracking/:id" element={<OrderTrackingPage />} />
        <Route path="/verification" element={<DeliveryVerificationPage />} />
        <Route path="/success-feedback" element={<SuccessFeedbackPage />} />
        <Route path="/orders" element={<OrdersHistoryPage />} />
        <Route path="/support/tickets/:ticketId?" element={<SupportTicketsPage />} />
        <Route path="/profile" element={<UserProfilePage />} />
        <Route path="/profile/edit" element={<EditProfilePage />} />
        <Route path="/profile/create" element={<ProfileCreationPage />} />
        <Route path="/profile/addresses" element={<AddressesPage />} />
        <Route path="/profile/payment" element={<PaymentMethodsPage />} />
        <Route path="/profile/wallet" element={<WalletPage />} />
        <Route path="/support" element={<HelpCenterPage />} />
        <Route path="/review" element={<RateAndReviewPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/services" element={<AllServicesPage />} />
        <Route path="/search" element={<SearchResultsPage />} />
        <Route path="/service-info" element={<ServiceInfoPage />} />
        <Route path="/careers" element={<CareersPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/become-vendor" element={<RegisterAsVendorPage />} />
        <Route path="/become-supplier" element={<RegisterAsSupplierPage />} />
        <Route path="/become-supplier/select-products" element={<SupplierProductSelectionPage />} />
        <Route path="/more" element={<MoreMenuPage />} />
        <Route path="/materials" element={<MaterialsCatalogPage />} />
        <Route path="/feedback" element={<FeedbackForm />} />
        <Route path="/upload-photos" element={<ServiceImageUploadPage />} />
        <Route path="/referral" element={<ReferralPage />} />
      </Route>

      {/* Standalone independent legal routes under /user/ */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsConditionsPage />} />

      {/* Fallback to landing */}
      <Route path="*" element={<Navigate to="/user/land" replace />} />
    </Routes>
  );
};

export default UserRoutes;
