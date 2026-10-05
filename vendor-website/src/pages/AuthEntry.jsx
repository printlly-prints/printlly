import { Link } from "react-router-dom";

// "/auth" - the first fork in the road for anyone signing up or signing
// in. Customers go on to /auth/get-app (there's no customer web login,
// only the mobile app); vendors go on to /auth/vendor, where the
// existing email/password + Google login form lives untouched.
export default function AuthEntry() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-3xl">
        <h1 className="font-heading font-bold text-3xl text-text-primary text-center">
          How would you like to continue?
        </h1>

        <div className="mt-10 grid sm:grid-cols-2 gap-6">
          <ChoiceCard
            to="/auth/get-app"
            icon={<PhoneIcon />}
            title="I'm a customer"
            subtext="Order prints from nearby shops using our mobile app"
          />
          <ChoiceCard
            to="/auth/vendor"
            icon={<StorefrontIcon />}
            title="I'm a vendor"
            subtext="Manage your print shop and orders"
          />
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ to, icon, title, subtext }) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-border bg-surface p-8 transition-colors hover:bg-primary-wash hover:border-primary"
    >
      <div className="w-12 h-12 rounded-lg bg-surface border border-primary-wash text-primary-deep flex items-center justify-center">
        {icon}
      </div>
      <p className="mt-5 font-heading font-semibold text-xl text-text-primary">{title}</p>
      <p className="mt-1.5 text-text-muted">{subtext}</p>
    </Link>
  );
}

function PhoneIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function StorefrontIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
      <path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
    </svg>
  );
}
