import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import "./styles/paper.css";

// Every page is code-split. Two distinct audiences never need each
// other's code: a visitor landing on "/" gets the marketing page without
// downloading the whole vendor dashboard, and a vendor going straight to
// /orders doesn't download the landing page's illustrations, testimonials
// and QR-code library. Previously all of it shipped as one chunk to
// everyone.
//
// ProtectedRoute and AuthContext stay eagerly imported on purpose - they
// participate in the very first render decision on every route, so
// splitting them would only add a loading flash before anything can be
// decided.
const LandingPage = lazy(() => import("./pages/LandingPage"));
const PrintPartners = lazy(() => import("./pages/PrintPartners"));
const AuthEntry = lazy(() => import("./pages/AuthEntry"));
const GetApp = lazy(() => import("./pages/GetApp"));
const Login = lazy(() => import("./pages/Login"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ShopRegistration = lazy(() => import("./pages/ShopRegistration"));
const ShopProfile = lazy(() => import("./pages/ShopProfile"));
const OrdersDashboard = lazy(() => import("./pages/OrdersDashboard"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const Earnings = lazy(() => import("./pages/Earnings"));
const Settings = lazy(() => import("./pages/Settings"));
const Notifications = lazy(() => import("./pages/Notifications"));

// Legal and information pages. Public, unauthenticated, and lazy like the
// rest - a customer reading the refund policy should not be made to download
// the dashboard bundle.
const About = lazy(() => import("./pages/legal/About"));
const Contact = lazy(() => import("./pages/legal/Contact"));
const Faq = lazy(() => import("./pages/legal/Faq"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Refunds = lazy(() => import("./pages/legal/Refunds"));
const Delivery = lazy(() => import("./pages/legal/Delivery"));
const Cookies = lazy(() => import("./pages/legal/Cookies"));
const DataDeletion = lazy(() => import("./pages/legal/DataDeletion"));
const Grievance = lazy(() => import("./pages/legal/Grievance"));
const Billing = lazy(() => import("./pages/legal/Billing"));
const VendorTerms = lazy(() => import("./pages/legal/VendorTerms"));

// Decides where a logged-in owner lands: Orders if they already have a
// shop, otherwise the shop registration form. This is the authenticated
// entry point ("/app"), separate from "/" which is the public marketing
// page. Lands on "/dashboard", which is now the real overview: what
// needs accepting, what is printing, what is waiting and what today has
// earned.
function AppEntry() {
  const { shop, shopLoading } = useAuth();

  if (shopLoading) {
    return (
      <div className="p-8 text-center text-text-secondary">Loading...</div>
    );
  }
  return <Navigate to={shop ? "/dashboard" : "/register-shop"} replace />;
}

export default function App() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [pathname]);

  return (
    // One Suspense boundary around the whole route table: only ever one
    // page is mounting at a time, and the fallback matches the wording
    // ProtectedRoute/AppEntry already use for their own brief waits, so a
    // chunk fetch looks the same as any other load rather than a new kind
    // of screen.
    <Suspense
      fallback={
        <div className="route-loading" role="status" aria-label="Loading page">
          <span>Paprout</span>
          <div className="route-loading-bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="sr-only">Loading page</span>
        </div>
      }
    >
      <Routes>
        {/* Public marketing page - never gated behind auth. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/print-partners" element={<PrintPartners />} />

        {/* Public: "are you a customer or a vendor?" chooser. Already-
            authenticated vendors skip straight past it. */}
        <Route
          path="/auth"
          element={
            isAuthenticated ? <Navigate to="/app" replace /> : <AuthEntry />
          }
        />

        {/* Public: customer path - just a QR code / store links, no auth. */}
        <Route path="/auth/get-app" element={<GetApp />} />

        {/* Public: the actual vendor login form (email/password + Google). */}
        <Route
          path="/auth/vendor"
          element={isAuthenticated ? <Navigate to="/app" replace /> : <Login />}
        />

        {/* Public: lands here straight from the Google OAuth redirect, so it
            must not be gated behind ProtectedRoute (there's no session yet). */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Requires login only - the authenticated equivalent of "/". */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppEntry />
            </ProtectedRoute>
          }
        />

        {/* Requires login only — this is where owners without a shop go. */}
        <Route
          path="/register-shop"
          element={
            <ProtectedRoute>
              <ShopRegistration />
            </ProtectedRoute>
          }
        />

        {/* Every route below requires login AND a registered shop, and
            shares the Sidebar/DashboardLayout nav (see Sidebar.jsx). Only
            Settings is still a deliberate placeholder (ComingSoon). */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requireShop>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/orders"
          element={
            <ProtectedRoute requireShop>
              <OrdersDashboard />
            </ProtectedRoute>
          }
        />

        {/* Kept only as a redirect, not as a page: "Recent Orders" was
            the same table as Orders on a different tab, and two routes
            rendering one page meant the sidebar could highlight either.
            Existing bookmarks land on the Completed tab of Orders. */}
        <Route
          path="/recent-orders"
          element={<Navigate to="/orders?status=completed" replace />}
        />

        <Route
          path="/pricing"
          element={
            <ProtectedRoute requireShop>
              <PricingPage />
            </ProtectedRoute>
          }
        />

        {/* What the shop is owed and what has already been paid out.
            Reads GET /shops/me/settlements, which is scoped to the
            logged-in owner's own shop. */}
        <Route
          path="/earnings"
          element={
            <ProtectedRoute requireShop>
              <Earnings />
            </ProtectedRoute>
          }
        />

        {/* Photos + KYC. Landed on right after registering a shop, and
            reachable any time after via the sidebar or the dashboard's
            VerificationBanner. */}
        <Route
          path="/shop-profile"
          element={
            <ProtectedRoute requireShop>
              <ShopProfile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute requireShop>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route path="/notifications" element={<ProtectedRoute requireShop><Notifications /></ProtectedRoute>} />

        {/* Legal and information pages. Flat, readable URLs rather than a
            /legal/* prefix, because these are the addresses that end up in
            app store listings, payment gateway onboarding forms and printed
            material, where a shorter path is easier to transcribe. */}
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund-policy" element={<Refunds />} />
        <Route path="/delivery-policy" element={<Delivery />} />
        <Route path="/cookie-policy" element={<Cookies />} />
        <Route path="/data-deletion" element={<DataDeletion />} />
        <Route path="/grievance" element={<Grievance />} />
        <Route path="/payment-billing" element={<Billing />} />
        <Route path="/vendor-terms" element={<VendorTerms />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
