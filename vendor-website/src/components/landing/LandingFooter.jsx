import { Link } from "react-router-dom";
import Logo from "../Logo";
import { SingleLeaf } from "./illustrations/Leaves";

// Every link here resolves to a real page. The footer previously carried
// inert "#" anchors for Careers, Blog, Help Center, Privacy and Terms,
// because those pages did not exist; the legal and information pages now do,
// and the entries that still have nothing behind them (Careers, Blog) have
// been removed rather than left as dead links.
//
// `route` is an in-app route rendered as a <Link>. `to` is a plain anchor,
// used only for the landing page's own section fragments, which are
// root-relative so they work from a legal page too.
const COLUMNS = [
  {
    title: "Printlly",
    links: [
      { label: "Home", to: "/#top" },
      { label: "Find Shops", to: "/#shops" },
      { label: "How It Works", to: "/#how-it-works" },
      { label: "About Us", route: "/about" },
      { label: "FAQ", route: "/faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms & Conditions", route: "/terms" },
      { label: "Privacy Policy", route: "/privacy" },
      { label: "Cancellation & Refunds", route: "/refund-policy" },
      { label: "Shipping & Delivery", route: "/delivery-policy" },
      { label: "Cookie Policy", route: "/cookie-policy" },
      { label: "Account & Data Deletion", route: "/data-deletion" },
    ],
  },
  {
    title: "Partners",
    links: [
      { label: "Partner with Us", route: "/auth/vendor" },
      { label: "Print Partner Terms", route: "/vendor-terms" },
      { label: "Partner Support", route: "/contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Contact Us", route: "/contact" },
      { label: "Payment & Billing", route: "/payment-billing" },
      { label: "Grievance & Legal", route: "/grievance" },
      { label: "Get the App", route: "/auth/get-app" },
    ],
  },
];

function FooterLink({ link }) {
  // On the dark ground the link colours are white at two opacities rather
  // than the text tokens, which are all tuned for light surfaces. Resting
  // is 78% white (about 8:1 here) and hover goes to full white.
  const cls =
    "text-[13.5px] text-white/[0.78] hover:text-white transition-colors duration-200";
  if (link.route) {
    return (
      <Link to={link.route} className={cls}>
        {link.label}
      </Link>
    );
  }
  return (
    <a href={link.to} className={cls}>
      {link.label}
    </a>
  );
}

export default function LandingFooter() {
  return (
    // The one dark surface on the page: the floor of the environment
    // rather than a break from it, so it keeps the same teal-green hue and
    // the same leaf motif, just inverted.
    <footer className="relative overflow-hidden bg-[linear-gradient(180deg,#12463C_0%,#0E3A33_100%)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/4 w-[560px] h-[360px] rounded-[50%] bg-[radial-gradient(ellipse,rgba(14,165,168,.22)_0%,rgba(14,165,168,0)_70%)] blur-2xl"
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 text-white">
        <SingleLeaf className="right-[-24px] top-4 w-[150px] h-[150px] rotate-[168deg] hidden md:block opacity-[0.55]" />
        <SingleLeaf className="left-[-30px] bottom-2 w-[120px] h-[120px] rotate-[36deg] hidden lg:block opacity-[0.45]" />
      </span>

      <div className="relative max-w-[1180px] mx-auto px-5 sm:px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))]">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <Logo size={30} />
              <span className="font-heading text-[19px] font-extrabold tracking-[-0.03em] text-white">
                Printlly
              </span>
            </Link>
            <p className="mt-3.5 text-[13.5px] text-white/[0.72]">
              Print Smarter. Skip the Wait.
            </p>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/[0.55] max-w-[230px]">
              Upload, pay online and collect from a nearby print shop.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="font-heading text-[13.5px] font-bold text-white">{col.title}</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-white/[0.14] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[12.5px] text-white/[0.62]">
            © 2026 Printlly. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1.5">
            <Link to="/terms" className="text-[12.5px] text-white/[0.62] hover:text-white transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="text-[12.5px] text-white/[0.62] hover:text-white transition-colors">
              Privacy
            </Link>
            <Link to="/refund-policy" className="text-[12.5px] text-white/[0.62] hover:text-white transition-colors">
              Refunds
            </Link>
            <Link to="/contact" className="text-[12.5px] text-white/[0.62] hover:text-white transition-colors">
              Contact
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
