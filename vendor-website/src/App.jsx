import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import PublicShell from "./components/PublicShell";
import MascotRecovery from "./components/MascotRecovery";

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
const AuthEntry = lazy(() => import("./pages/AuthEntry"));
const GetApp = lazy(() => import("./pages/GetApp"));
const Login = lazy(() => import("./pages/Login"));
const PartnerRegistration = lazy(() => import("./pages/PartnerRegistration"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ShopRegistration = lazy(() => import("./pages/ShopRegistration"));
const ShopProfile = lazy(() => import("./pages/ShopProfile"));
const OrdersDashboard = lazy(() => import("./pages/OrdersDashboard"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const Earnings = lazy(() => import("./pages/Earnings"));
const Availability = lazy(() => import("./pages/Availability"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const RecoveryPage = lazy(() => import("./pages/RecoveryPage"));

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
// needs accepting, what is accepted, what is waiting and what today has
// earned.
function AppEntry() {
  const { shop, shopLoading, shopError, shopRequestError, refreshShop } = useAuth();

  if (shopLoading) {
    return <div className="p-8 text-center text-text-secondary">Loading...</div>;
  }
  if (shopError) return <PublicShell footer={false}><div className="recovery-page"><MascotRecovery error={shopRequestError} onRetry={refreshShop} /></div></PublicShell>;
  return <Navigate to={shop ? "/dashboard" : "/register-shop"} replace />;
}

export default function App() {
  const { isAuthenticated, sessionError } = useAuth();

  if (sessionError) return <Suspense fallback={<p role="status">Loading…</p>}><RecoveryPage requestError={sessionError} /></Suspense>;

  return (
    // One Suspense boundary around the whole route table: only ever one
    // page is mounting at a time, and the fallback matches the wording
    // ProtectedRoute/AppEntry already use for their own brief waits, so a
    // chunk fetch looks the same as any other load rather than a new kind
    // of screen.
    <Suspense fallback={<div className="p-8 text-center text-text-secondary">Loading...</div>}>
      <Routes>
        {/* Public marketing page - never gated behind auth. */}
        <Route path="/" element={<LandingPage />} />

        {/* Public: "are you a customer or a vendor?" chooser. Already-
            authenticated vendors skip straight past it. */}
        <Route
          path="/auth"
          element={isAuthenticated ? <Navigate to="/app" replace /> : <AuthEntry />}
        />

        {/* Public: customer path - just a QR code / store links, no auth. */}
        <Route path="/auth/get-app" element={<GetApp />} />

        {/* Public: the actual vendor login form (email/password + Google). */}
        <Route
          path="/auth/vendor"
          element={isAuthenticated ? <Navigate to="/app" replace /> : <Login />}
        />

        <Route path="/auth/vendor/register" element={isAuthenticated ? <Navigate to="/app" replace /> : <PartnerRegistration />} />

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
            shares the Sidebar/DashboardLayout navigation. */}
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
        <Route path="/recent-orders" element={<Navigate to="/orders?status=completed" replace />} />

        <Route
          path="/pricing"
          element={
            <ProtectedRoute requireShop>
              <PricingPage />
            </ProtectedRoute>
          }
        />
        <Route path="/availability" element={<ProtectedRoute requireShop><Availability /></ProtectedRoute>} />

        {/* What the shop is owed and what has already been recorded as paid.
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

        {/* Legal and information pages. Flat, readable URLs rather than a
            /legal/* prefix, because these are the addresses that end up in
            app store listings, payment gateway onboarding forms and printed
            material, where a shorter path is easier to transcribe. */}
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/help" element={<Help />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund-policy" element={<Refunds />} />
        <Route path="/delivery-policy" element={<Delivery />} />
        <Route path="/cookie-policy" element={<Cookies />} />
        <Route path="/data-deletion" element={<DataDeletion />} />
        <Route path="/grievance" element={<Grievance />} />
        <Route path="/payment-billing" element={<Billing />} />
        <Route path="/vendor-terms" element={<VendorTerms />} />

        <Route path="/offline" element={<RecoveryPage reaction="offline" />} />
        <Route path="/service-unavailable" element={<RecoveryPage reaction="service_unavailable" />} />
        <Route path="*" element={<RecoveryPage reaction="not_found" />} />
      </Routes>
    </Suspense>
  );
}
