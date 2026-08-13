import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Toaster } from 'react-hot-toast';
import RouteAnalyticsTracker from './components/analytics/RouteAnalyticsTracker';
import PromoterReferralTracker from './components/promoters/PromoterReferralTracker';
import { isLocalHost, isPlatformHost, isPlatformSubdomainHost } from './utils/platform';

const Home = lazy(() => import('./shop/Home'));
const ProductDetail = lazy(() => import('./shop/ProductDetail'));
const Category = lazy(() => import('./shop/Category'));
const Cart = lazy(() => import('./shop/Cart'));
const Checkout = lazy(() => import('./shop/Checkout'));
const OrderSuccess = lazy(() => import('./shop/OrderSuccess'));
const OrderHistory = lazy(() => import('./shop/OrderHistory'));
const SearchResults = lazy(() => import('./shop/SearchResults'));
const AllProducts = lazy(() => import('./shop/AllProducts'));
const Deals = lazy(() => import('./shop/Deals'));
const GiftCards = lazy(() => import('./shop/GiftCards'));
const StorePage = lazy(() => import('./shop/StorePage'));
const MarketplacePlaceholder = lazy(() => import('./pages/marketplace/MarketplacePlaceholder'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Account = lazy(() => import('./pages/auth/Account'));
const AdminClaim = lazy(() => import('./pages/AdminClaim'));
const VendorTerms = lazy(() => import('./pages/VendorTerms'));

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminApplications = lazy(() => import('./pages/admin/AdminApplications'));
const VendorApprovals = lazy(() => import('./pages/admin/VendorApprovals'));
const AdminVendors = lazy(() => import('./pages/admin/AdminVendors'));
const AdminCouriers = lazy(() => import('./pages/admin/AdminCouriers'));
const AdminCourierSettings = lazy(() => import('./pages/admin/AdminCourierSettings'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminPaymentMethods = lazy(() => import('./pages/admin/AdminPaymentMethods'));
const AdminShippingZones = lazy(() => import('./pages/admin/AdminShippingZones'));
const AdminShippingAnalytics = lazy(() => import('./pages/admin/AdminShippingAnalytics'));
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminUpdates = lazy(() => import('./pages/admin/AdminUpdates'));
const AdminReturns = lazy(() => import('./pages/admin/AdminReturns'));
const AdminPayouts = lazy(() => import('./pages/admin/AdminPayouts'));
const AdminPromoters = lazy(() => import('./pages/admin/AdminPromoters'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const About = lazy(() => import('./pages/About'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const PromoterApply = lazy(() => import('./pages/promoters/PromoterApply'));
const PromoterDashboard = lazy(() => import('./pages/promoters/PromoterDashboard'));

const Storefront = lazy(() => import('./pages/storefront/Storefront'));
const VendorApply = lazy(() => import('./vendor/Apply'));
const VendorPending = lazy(() => import('./vendor/Pending'));
const VendorDashboard = lazy(() => import('./vendor/Dashboard'));
const VendorRouter = lazy(() => import('./vendor/VendorRouter'));
const VendorProducts = lazy(() => import('./pages/dashboard/Products'));
const ProductForm = lazy(() => import('./pages/dashboard/ProductForm'));
const ShippingZones = lazy(() => import('./pages/dashboard/ShippingZones'));
const ShippingZoneForm = lazy(() => import('./pages/dashboard/ShippingZoneForm'));
const TaxRates = lazy(() => import('./pages/dashboard/TaxRates'));
const TaxRateForm = lazy(() => import('./pages/dashboard/TaxRateForm'));
const Analytics = lazy(() => import('./pages/dashboard/Analytics'));
const FirebaseTest = lazy(() => import('./pages/FirebaseTest'));
const VendorOrders = lazy(() => import('./pages/dashboard/Orders'));
const VendorReturns = lazy(() => import('./pages/dashboard/Returns'));
const VendorPayouts = lazy(() => import('./pages/dashboard/Payouts'));
const VendorStoreSettings = lazy(() => import('./pages/dashboard/StoreSettings'));
const CustomerService = lazy(() => import('./shop/CustomerService'));

function AppLoader() {
  return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
}

function ProtectedRoute({ children, requireVendor, requireApproved, pendingPath = '/pending', allowAdminAccess }) {
  const { user, tenant, loading } = useAuth();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isAdminAccess =
    allowAdminAccess &&
    searchParams.get('adminAccess') === 'true' &&
    !!searchParams.get('vendorId');
  if (loading) return <AppLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isAdminAccess) {
    if (requireVendor && !tenant) return <Navigate to="/login" state={{ from: location }} replace />;
    if (requireApproved && tenant && !tenant.isActive) return <Navigate to={pendingPath} replace />;
  }
  return children;
}

function isAdminHost() {
  const host = window.location.hostname;
  return isPlatformSubdomainHost(host, ['admin']);
}

function isSellHost() {
  const host = window.location.hostname;
  return isPlatformSubdomainHost(host, ['sell', 'vendor']);
}

function isStorefrontMode() {
  if (window.TENANT_ID) return true;
  const host = window.location.hostname;
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com') || isLocalHost(host)) return false;
  if (isPlatformHost(host)) return false;
  if (isPlatformSubdomainHost(host, ['admin', 'sell', 'vendor'])) return false;
  return true;
}

function App() {
  if (isStorefrontMode()) {
    return (
      <CartProvider>
        <AuthProvider>
          <Suspense fallback={<AppLoader />}>
            <Storefront />
          </Suspense>
          <Toaster position="top-center" />
        </AuthProvider>
      </CartProvider>
    );
  }

  const adminHost = isAdminHost();
  const sellHost = isSellHost();

  return (
    <CartProvider>
      <AuthProvider>
        <BrowserRouter>
          <RouteAnalyticsTracker />
          <PromoterReferralTracker />
          <Suspense fallback={<AppLoader />}>
            <Routes>
              <Route
                path="/"
                element={
                  adminHost ? <Navigate to="/admin" replace /> : sellHost ? <Navigate to="/sell" replace /> : <Home />
                }
              />

              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/account" element={<Account />} />
              <Route path="/admin-claim" element={<AdminClaim />} />
              <Route path="/vendor-terms" element={<VendorTerms />} />
              <Route path="/promoters" element={<Navigate to="/promoters/apply" replace />} />
              <Route path="/promoters/apply" element={<PromoterApply />} />
              <Route
                path="/promoters/dashboard"
                element={
                  <ProtectedRoute>
                    <PromoterDashboard />
                  </ProtectedRoute>
                }
              />

              <Route path="/sell" element={<VendorApply />} />
              <Route path="/sell/apply" element={<VendorApply />} />
              <Route path="/sell/pending" element={<VendorPending />} />
              <Route path="/firebase-test" element={<FirebaseTest />} />
              <Route
                path="/sell/dashboard"
                element={
                  <ProtectedRoute requireVendor requireApproved pendingPath="/sell/pending" allowAdminAccess>
                    <VendorRouter />
                  </ProtectedRoute>
                }
              >
                <Route index element={<VendorDashboard />} />
                <Route path="products" element={<VendorProducts />} />
                <Route path="products/:id" element={<ProductForm />} />
                <Route path="shipping" element={<ShippingZones />} />
                <Route path="shipping/:id" element={<ShippingZoneForm />} />
                <Route path="tax" element={<TaxRates />} />
                <Route path="tax/:id" element={<TaxRateForm />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="orders" element={<VendorOrders />} />
                <Route path="orders/:id" element={<VendorOrders />} />
                <Route path="returns" element={<VendorReturns />} />
                <Route path="payouts" element={<VendorPayouts />} />
                <Route path="store" element={<VendorStoreSettings />} />
                <Route path="settings" element={<VendorStoreSettings />} />
              </Route>

              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="applications" element={<VendorApprovals />} />
                <Route path="vendors" element={<AdminVendors />} />
                <Route path="couriers" element={<AdminCouriers />} />
                <Route path="courier-settings" element={<AdminCourierSettings />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="payment-methods" element={<AdminPaymentMethods />} />
                <Route path="shipping-zones" element={<AdminShippingZones />} />
                <Route path="shipping-analytics" element={<AdminShippingAnalytics />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="updates" element={<AdminUpdates />} />
                <Route path="returns" element={<AdminReturns />} />
                <Route path="payouts" element={<AdminPayouts />} />
                <Route path="promoters" element={<AdminPromoters />} />
                <Route path="points" element={<Navigate to="/admin/promoters" replace />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>

              {!adminHost && !sellHost && (
                <>
                  <Route path="/product/:id" element={<ProductDetail />} />
                  <Route path="/category/:id" element={<Category />} />
                  <Route path="/store/:subdomain" element={<StorePage />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route
                    path="/checkout"
                    element={
                      <ProtectedRoute>
                        <Checkout />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/order-success" element={<OrderSuccess />} />
                  <Route
                    path="/orders"
                    element={
                      <ProtectedRoute>
                        <OrderHistory />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/search" element={<SearchResults />} />
                  <Route path="/products" element={<AllProducts />} />

                  <Route path="/deals" element={<Deals />} />
                  <Route path="/customer-service" element={<CustomerService />} />
                  <Route path="/gift-cards" element={<GiftCards />} />
                  <Route path="/help" element={<HelpCenter />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/careers" element={<MarketplacePlaceholder title="Careers" />} />
                  <Route path="/press" element={<MarketplacePlaceholder title="Press Releases" />} />
                  <Route path="/affiliate" element={<PromoterApply />} />
                  <Route path="/business" element={<MarketplacePlaceholder title="Business Card" />} />
                  <Route path="/points" element={<Navigate to="/promoters/apply" replace />} />
                  <Route path="/reload" element={<MarketplacePlaceholder title="Reload Balance" />} />
                </>
              )}
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="top-center" />
      </AuthProvider>
    </CartProvider>
  );
}

export default App;
