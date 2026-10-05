import { Link } from "react-router-dom";
import { SectionLabel, Scribble } from "./primitives";
import PhoneMockups from "./illustrations/PhoneMockups";
import Reveal from "./Reveal";

const BENEFITS = [
  "Upload and manage documents",
  "Find nearby print shops",
  "Track your orders in real-time",
  "Secure and private",
];

// Both badges point at /auth/get-app — the QR + install page. There are
// no live store listings yet, so linking straight to a store URL would
// be a dead end.
function StoreBadge({ to, top, bottom, icon }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2.5 h-12 px-4 rounded-control border border-border-strong bg-[#123326] text-white hover:bg-[#18423D] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {icon}
      <span className="text-left leading-tight">
        <span className="block text-[9px] tracking-wide opacity-75">{top}</span>
        <span className="block font-heading text-[13px] font-bold">{bottom}</span>
      </span>
    </Link>
  );
}

export default function AppPromo() {
  return (
    <section className="relative overflow-hidden">

      <div className="relative max-w-[1180px] mx-auto px-5 sm:px-6 py-16 lg:py-20 grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">
        <Reveal>
          <SectionLabel>On the go</SectionLabel>
          <h2 className="mt-5 font-heading font-bold text-text-primary tracking-[-0.03em] text-[30px] leading-[1.2] sm:text-[36px]">
            Printlly in your pocket
          </h2>
          <p className="mt-3.5 text-[15px] text-text-secondary">
            Same convenience. Anytime. Anywhere.
          </p>

          <ul className="mt-8 flex flex-col gap-3.5">
            {BENEFITS.map((b) => (
              <li key={b} className="group/b flex items-center gap-3">
                <span className="w-[22px] h-[22px] rounded-full bg-primary flex items-center justify-center shrink-0 transition-transform duration-200 ease-out group-hover/b:scale-110 group-hover/b:bg-primary-deep">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span className="text-[14.5px] text-text-primary transition-colors duration-200 group-hover/b:text-primary-deep">
                  {b}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-wrap gap-3">
            <StoreBadge
              to="/auth/get-app"
              top="GET IT ON"
              bottom="Google Play"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.6 2.4v19.2c0 .5.5.8.9.5l11-9.6c.3-.3.3-.7 0-1l-11-9.6c-.4-.3-.9 0-.9.5z" fill="#0EA5A8" />
                  <path d="M16.9 9.3 19.9 11c.6.4.6 1.2 0 1.6l-3 1.7-2.6-2.5z" fill="#FFFFFF" opacity=".85" />
                </svg>
              }
            />
            <StoreBadge
              to="/auth/get-app"
              top="Download on the"
              bottom="App Store"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
                  <path d="M16.4 12.6c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7c1.1 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.5 0 0-2.2-.9-2.3-3.2zM14.2 5.9c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.7-.9 2.6 1 .1 2-.5 2.6-1.2z" />
                </svg>
              }
            />
          </div>
        </Reveal>

        <Reveal delay={140} className="relative">
          {/* Glow pooled behind the pair so they read as lit objects. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-[12%] bottom-[8%] rounded-[48%] bg-[radial-gradient(ellipse,rgba(17,148,138,.22)_0%,rgba(17,148,138,0)_70%)] blur-2xl"
          />
          <div className="relative">
            <PhoneMockups />
          </div>
          {/* Top-left of the phone cluster — the phones are right-aligned
              at lg, so this stays clear of them. */}
          <Scribble className="hidden lg:block absolute left-0 top-2 text-[19px]">
            Simple.
            <br />
            Fast.
            <br />
            Reliable.
          </Scribble>
        </Reveal>
      </div>
    </section>
  );
}
