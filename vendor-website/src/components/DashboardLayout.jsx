import Sidebar from "./Sidebar";
import DashboardBackdrop from "./dashboard/DashboardBackdrop";
import DeactivatedBanner from "./DeactivatedBanner";

// Shared shell for every authenticated vendor page once a shop exists:
// Sidebar on the left (a top bar + dropdown on mobile - see Sidebar.jsx),
// page content on the right. Pages keep their own inner max-width wrapper
// (a narrow form reads better than a wide grid) - this only supplies the
// consistent frame and padding around whatever they render.
//
// DeactivatedBanner sits above that content, full-width, on every page
// this layout wraps - it renders nothing while the shop is active, so
// this is the one place it needs wiring in for it to be "across the
// dashboard" rather than just one screen.
export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen md:flex bg-background-page">
      {/* Fixed, behind everything, pointer-events-none - see the
          component for why a working surface gets decoration at all and
          what it is not allowed to do. */}
      <DashboardBackdrop />
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <DeactivatedBanner />
        <div className="flex-1 min-w-0 px-4 py-6 sm:px-6 md:px-8">{children}</div>
      </div>
    </div>
  );
}
