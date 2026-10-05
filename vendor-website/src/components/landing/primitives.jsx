import { Link } from "react-router-dom";

// Shared building blocks for the marketing page, so button and label
// styling is defined once rather than restated in every section.

// Shared hover system (see §22 of the design brief): every card-like
// surface lifts by the same amount, to the same shadow, over the same
// duration. Import this rather than restating the classes, so the page
// never ends up with three slightly different lifts.
export const CARD_HOVER =
  "transition-[transform,box-shadow,border-color] duration-200 ease-out " +
  "shadow-card hover:-translate-y-1.5 hover:shadow-card-hover hover:border-primary/40";

const BASE =
  "group/btn inline-flex items-center justify-center gap-2 font-heading font-bold rounded-control " +
  "transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out " +
  "active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

const SIZES = {
  md: "h-11 px-5 text-sm",
  lg: "h-[52px] px-7 text-[15px]",
};

const VARIANTS = {
  primary:
    "bg-primary text-white shadow-cta hover:bg-primary-deep hover:-translate-y-0.5 hover:shadow-cta-hover active:shadow-cta",
  outline:
    "bg-surface text-text-primary border border-border shadow-card hover:-translate-y-0.5 hover:border-primary hover:text-primary-bright hover:bg-primary-wash/50 hover:shadow-card-hover",
  ghostOnTeal:
    "bg-surface text-primary-bright border border-primary/25 shadow-card hover:-translate-y-0.5 hover:border-primary hover:shadow-card-hover",
};

// Renders as a router <Link> for in-app routes, a plain <a> for hash
// anchors — react-router's Link doesn't scroll to fragments on its own.
export function CTA({ to, variant = "primary", size = "lg", children, className = "" }) {
  const cls = `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`;
  if (to.startsWith("#")) {
    return (
      <a href={to} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={cls}>
      {children}
    </Link>
  );
}

// The small uppercase pill above most section headings.
export function SectionLabel({ children, className = "" }) {
  return (
    <span
      className={`inline-block px-3 py-1.5 rounded-full bg-primary-wash text-primary-bright text-[11px] font-bold tracking-[0.14em] uppercase ${className}`}
    >
      {children}
    </span>
  );
}

// Handwritten marginalia around the illustrations. Decorative only, so
// it's hidden from screen readers rather than read out of context.
export function Scribble({ children, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`font-hand text-primary-deep leading-[1.15] select-none pointer-events-none ${className}`}
    >
      {children}
    </span>
  );
}

// Nudges right when the button or link it sits inside is hovered.
export function ArrowRight({ className = "" }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-200 ease-out group-hover/btn:translate-x-1 group-hover:translate-x-1 ${className}`}
    >
      <path d="M5 12h13" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
