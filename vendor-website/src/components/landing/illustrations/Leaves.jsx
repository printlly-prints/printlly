// Organic leaf shapes for the Nature Green theme — the only "nature"
// motif on the page, used as soft background marks rather than content.
//
// Every instance is aria-hidden and pointer-events-none: these sit behind
// real content and must never intercept a click or be announced. They
// animate with the same float/drift utilities as the blurred orbs
// (transform-only, disabled under prefers-reduced-motion), so they cost
// nothing on the layout path.
//
// Two rules learned from rendering these:
//   * The midrib is drawn in the leaf's own colour at a slightly higher
//     alpha, not in white. A white vein over a 10%-opacity body is three
//     times stronger than the body and reads as a scratch, not a leaf.
//   * Every wrapper carries an explicit width and height. Absolutely
//     positioned children inside a bare <span> collapse it to 0×0, and
//     the leaves then hang outside the section and get clipped away.

// One leaf: a pointed silhouette with a single curved midrib.
function Leaf({ className = "" }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <path d="M50 3C79 26 94 57 50 97 6 57 21 26 50 3Z" fill="currentColor" />
      <path
        d="M50 9C53 38 52 66 50 93"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".85"
      />
    </svg>
  );
}

// A sprig of three leaves. `side` mirrors it so the sprig always grows
// into the section rather than off the edge.
export default function LeafCluster({ side = "left", className = "" }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute select-none ${className}`}>
      <span
        className={`relative block w-[170px] h-[165px] ${side === "right" ? "-scale-x-100" : ""}`}
      >
        <Leaf className="float-slow absolute top-0 left-0 w-[86px] h-[86px] text-leaf/[0.14] -rotate-[24deg]" />
        <Leaf className="float-slower absolute top-[42px] left-[64px] w-[64px] h-[64px] text-leaf/[0.11] rotate-[34deg]" />
        <Leaf className="drift-slow absolute top-[84px] left-[10px] w-[50px] h-[50px] text-leaf-soft/[0.20] rotate-[74deg]" />
      </span>
    </span>
  );
}

// A single oversized leaf, for sections that only want one quiet mark.
// Size and position come from className, as with the blurred orbs.
export function SingleLeaf({ className = "" }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute select-none ${className}`}>
      <Leaf className="float-slower w-full h-full text-leaf/[0.10]" />
    </span>
  );
}
