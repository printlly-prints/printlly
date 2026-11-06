// Shared app mark for the partner dashboard and registration screens.
export default function Logo({ size = 32, className = "" }) {
  return (
    <img
      src="/brand/paprout-mark.png"
      width={size}
      height={size}
      alt="Paprout"
      className={`shrink-0 object-contain ${className}`}
      style={{ height: size, width: size }}
    />
  );
}

// Mark + wordmark + tagline, as one image. Sized by width; the height
// follows the artwork, so give it room vertically.
export function LogoLockup({ width = 200, className = "" }) {
  return (
    <span
      className={`inline-flex flex-col items-center gap-2 ${className}`}
      style={{ width }}
    >
      <Logo size={64} />
      <strong className="font-heading text-2xl">Paprout</strong>
      <span className="text-sm" lang="hi-Latn">
        Paprout pe bhej de
      </span>
    </span>
  );
}
