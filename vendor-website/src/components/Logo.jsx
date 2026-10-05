// The Printlly mark, served from /public so it is a plain <img> rather
// than bundled into the JS. `logo.png` is the printer-and-page symbol on
// its own; the full vertical lockup (mark + wordmark + tagline) lives at
// /printlly-lockup.png and is used where there is room for it, such as
// the login card.
export default function Logo({ size = 32, className = "" }) {
  return (
    <img
      src="/printlly-mark.png"
      width={size}
      height={size}
      alt="Printlly"
      className={`shrink-0 object-contain ${className}`}
      style={{ height: size, width: size }}
    />
  );
}

// Mark + wordmark + tagline, as one image. Sized by width; the height
// follows the artwork, so give it room vertically.
export function LogoLockup({ width = 200, className = "" }) {
  return (
    <img
      src="/printlly-lockup.png"
      alt="Printlly — Print Smarter. Skip the Wait."
      className={`object-contain ${className}`}
      style={{ width }}
    />
  );
}
