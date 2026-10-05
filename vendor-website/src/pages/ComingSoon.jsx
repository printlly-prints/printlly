import DashboardLayout from "../components/DashboardLayout";

// Generic placeholder for sidebar sections that don't have a real page
// yet (Settings) - keeps the nav
// honest, every item goes somewhere, rather than a dead link or a 404.
export default function ComingSoon({ title, description }) {
  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-heading text-2xl font-bold text-text-primary">{title}</h1>

        <div className="mt-6 bg-surface rounded-panel border border-border p-8 flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-full bg-primary-wash flex items-center justify-center">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#087F8C"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l2.5 1.5" />
            </svg>
          </div>
          <p className="font-heading font-bold text-text-primary">Coming soon</p>
          <p className="text-sm text-text-secondary max-w-sm">
            {description || `${title} isn't built yet - it's here in the menu so the layout's ready for it.`}
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
