import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

// Same code-splitting approach as the vendor dashboard: nothing but the
// route currently being viewed is downloaded. Login especially shouldn't
// pull in the whole panel, since it is the one page an unauthenticated
// visitor can reach.
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const VendorVerification = lazy(() => import("./pages/VendorVerification"));
const Shops = lazy(() => import("./pages/Shops"));
const Orders = lazy(() => import("./pages/Orders"));
const Settlements = lazy(() => import("./pages/Settlements"));
const SettlementDetail = lazy(() => import("./pages/SettlementDetail"));
const SupportInbox = lazy(() => import("./pages/SupportInbox"));
const Settings = lazy(() => import("./pages/Settings"));

// Every route except /login is wrapped in ProtectedRoute, which redirects
// to /login without a session and logs out on any 401 from the API. The
// real enforcement is server-side (requireRole("admin") on every /admin/*
// route) - this only decides what to render.
export default function App() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-text-secondary">Loading...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/verification"
          element={
            <ProtectedRoute>
              <VendorVerification />
            </ProtectedRoute>
          }
        />

        <Route
          path="/shops"
          element={
            <ProtectedRoute>
              <Shops />
            </ProtectedRoute>
          }
        />

        <Route
          path="/orders"
          element={
            <ProtectedRoute>
              <Orders />
            </ProtectedRoute>
          }
        />

        {/* The list, and one shop's detail. A real route rather than a
            modal over the list: an admin leaves this screen to actually
            make the transfer and comes back with a reference. */}
        <Route
          path="/settlements"
          element={
            <ProtectedRoute>
              <Settlements />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settlements/:shopId"
          element={
            <ProtectedRoute>
              <SettlementDetail />
            </ProtectedRoute>
          }
        />

        <Route
          path="/support"
          element={
            <ProtectedRoute>
              <SupportInbox />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
