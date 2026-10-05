import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../Logo";

// Nav targets map onto routes that actually exist. The section order
// this page follows has no dedicated Pricing or About section, so those
// two point at the sections that carry that information: per-page rates
// live on the shop cards, and Features is what explains the product.
// Root-relative rather than bare fragments ("/#shops", not "#shops").
// The header is reused on the legal pages, where a bare "#shops" would
// resolve against /terms and scroll nowhere. These are plain anchors, so the
// browser performs a real navigation to the landing page and handles the
// fragment itself - no router or scroll handling needed, and the behaviour on
// the landing page is unchanged.
const NAV = [
  { label: "Home", href: "/#top" },
  { label: "Find Shops", href: "/#shops" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#shops" },
  { label: "About", href: "/about" },
];

export default function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Elevates the bar once the page moves, so it reads as floating over
  // the content rather than being a permanent heavy strip. Passive
  // listener, and it only ever flips a boolean.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // Soft teal glass. The fill is the page's own ground token at 88%
    // (rgba(234,247,244,.88)) rather than white, so the bar reads as a
    // pane of the environment rather than a white strip laid over it, and
    // backdrop-blur-lg is 16px - the middle of the intended 14-18px.
    //
    // The tint stays constant between states; it is the elevation that
    // changes on scroll, which keeps the bar from appearing to change
    // colour as the wash beneath it moves.
    <header
      className={`sticky top-0 z-50 backdrop-blur-lg border-b border-primary/10 bg-background/[0.88] transition-shadow duration-200 ${
        scrolled ? "shadow-nav" : "shadow-none"
      }`}
    >
      <div className="max-w-[1180px] mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setOpen(false)}>
          <Logo size={30} />
          <span className="font-heading text-[19px] font-extrabold tracking-[-0.03em] text-text-primary">
            Printlly
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="group relative py-2 text-[14px] font-medium text-text-secondary hover:text-primary-bright transition-colors duration-200"
            >
              {item.label}
              {/* Underline grows from the centre on hover. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0 right-0 bottom-0 h-0.5 rounded-full bg-primary origin-center scale-x-0 transition-transform duration-200 ease-out group-hover:scale-x-100"
              />
            </a>
          ))}
        </nav>

        <div className="hidden sm:flex items-center gap-2.5 shrink-0">
          <Link
            to="/auth/vendor"
            className="inline-flex items-center h-10 px-5 rounded-control border border-border text-[14px] font-heading font-bold text-text-primary transition-[background-color,border-color,color] duration-200 hover:border-primary hover:text-primary-bright hover:bg-primary-wash/60"
          >
            Login
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center h-10 px-5 rounded-control bg-primary text-white text-[14px] font-heading font-bold shadow-cta transition-[background-color,transform,box-shadow] duration-200 ease-out hover:bg-primary-deep hover:-translate-y-0.5 hover:shadow-cta-hover active:translate-y-0"
          >
            Get Started
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="lg:hidden w-11 h-11 -mr-2 flex items-center justify-center rounded-control text-text-primary hover:bg-background-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-primary/10 bg-background/[0.95] backdrop-blur-lg px-5 py-4 flex flex-col gap-1">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setOpen(false)}
              className="py-3 text-[15px] font-medium text-text-secondary hover:text-primary-bright"
            >
              {item.label}
            </a>
          ))}
          <div className="flex gap-2.5 pt-3">
            <Link
              to="/auth/vendor"
              className="flex-1 inline-flex items-center justify-center h-11 rounded-control border border-border font-heading font-bold text-sm text-text-primary"
            >
              Login
            </Link>
            <Link
              to="/auth"
              className="flex-1 inline-flex items-center justify-center h-11 rounded-control bg-primary text-white font-heading font-bold text-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
