import LeafCluster, { SingleLeaf } from "./illustrations/Leaves";

// The landing page's entire background, as ONE element spanning the whole
// document rather than a background per section.
//
// Why it is built this way: a page whose sections each paint their own
// ground can only ever *approximate* continuity — every boundary is a
// place where two fills meet, and the eye finds them. Here the sections
// are transparent and this single layer runs behind all of them, so the
// wash, the waves and the leaves cross section boundaries because there
// are no boundaries in the background to cross.
//
// It sits at the bottom of the stacking order (the page content is given
// `relative` so it paints above), is aria-hidden, and never takes a
// pointer event. Everything here animates on transform/opacity only, and
// the whole lot is stilled under prefers-reduced-motion.

// Percentage stops down the full document height, following the section
// progression. Adjacent sections share a stop value, so no junction has a
// step in it — the colour is already moving when it crosses a boundary.
// The percentages are the measured mid-points of each section on the
// rendered desktop page, not estimates. On narrower
// viewports the sections change height and the bands drift a little,
// which is harmless precisely because no two neighbouring tones are more
// than a few RGB points apart.
const BASE_WASH =
  "linear-gradient(180deg," +
  "#0D302B 0%," + //    0.0  hero, deepest teal at the very top
  "#0A2822 10%," + //  10.0  hero settles
  "#0A2822 15.4%," + // 15.4  trust strip
  "#0A2620 22.5%," + // 22.5  features: natural green
  "#0C2E29 33.8%," + // 33.8  how it works: a step deeper, for hierarchy
  "#092420 48.5%," + // 48.5  nearby shops: pale green
  "#0D302B 64%," + //   64.0  app promotion: strongest teal-green layer
  "#0A2822 77%," + //   77.0  testimonials
  "#0E332E 87%," + //   87.0  final CTA, deeper again
  "#0A2620 93%)"; //    93.0  and out into green where the dark footer starts

// One flowing band. Two stacked cubics give an asymmetric crest that
// reads as water rather than as a sine wave, and `preserveAspectRatio`
// with "none" lets a single path stretch to any viewport width.
//
// The blur is not decoration, it is the whole trick. Squashed into a
// band this shallow, the curve flattens towards a straight diagonal and
// its hard fill edge reads as a crease in cut paper. Blurring dissolves
// the edge, so what is left is the *gradient* of the curve — which is
// what actually looks like water. The bands are 130% of the viewport
// wide so the blur never reveals an end, and the fills are pitched a
// little stronger than the final effect because the blur spreads them.
function Wave({ className = "", fill, opacity = 1 }) {
  return (
    <svg
      viewBox="0 0 1440 320"
      preserveAspectRatio="none"
      className={className}
      style={{ opacity }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 96C180 40 340 24 520 72c180 48 300 128 486 128 132 0 288-40 434-116v236H0Z"
        fill={fill}
      />
    </svg>
  );
}

export default function PageBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      style={{ background: BASE_WASH }}
    >
      {/* ---- flowing wave layers -------------------------------------
          Each is positioned so its crest sits *across* a section join
          rather than inside one section, which is what carries the eye
          from one to the next. Heights are in vh so they scale with the
          viewport instead of pinning to a fixed pixel band. */}
      <Wave
        className="wave-drift absolute inset-x-0 top-[5%] w-[130%] -left-[15%] h-[42vh] blur-2xl"
        fill="#113933"
        opacity={0.85}
      />
      <Wave
        className="wave-drift-rev absolute inset-x-0 top-[19%] w-[130%] -left-[15%] h-[40vh] blur-2xl"
        fill="#103229"
        opacity={0.9}
      />
      <Wave
        className="wave-drift absolute inset-x-0 top-[41%] w-[130%] -left-[15%] h-[44vh] blur-2xl"
        fill="#123B35"
        opacity={0.8}
      />
      <Wave
        className="wave-drift-rev absolute inset-x-0 top-[59%] w-[130%] -left-[15%] h-[42vh] blur-2xl"
        fill="#14413A"
        opacity={0.75}
      />
      <Wave
        className="wave-drift absolute inset-x-0 top-[80%] w-[130%] -left-[15%] h-[40vh] blur-2xl"
        fill="#113429"
        opacity={0.8}
      />

      {/* ---- blurred depth -------------------------------------------
          Large, very low opacity, and deliberately not aligned to the
          waves, so the layering never resolves into a repeating rhythm. */}
      <span className="drift-slow absolute -top-40 -left-40 w-[620px] h-[620px] rounded-full bg-primary-accent/[0.10] blur-3xl" />
      <span className="float-slower absolute top-[16%] -right-40 w-[600px] h-[600px] rounded-full bg-leaf/[0.10] blur-3xl" />
      <span className="drift-slow absolute top-[40%] -left-52 w-[560px] h-[560px] rounded-full bg-leaf/[0.09] blur-3xl" />
      <span className="float-slower absolute top-[62%] -right-48 w-[640px] h-[640px] rounded-full bg-primary-accent/[0.09] blur-3xl" />
      <span className="drift-slow absolute top-[86%] -left-40 w-[520px] h-[520px] rounded-full bg-leaf/[0.10] blur-3xl" />

      {/* ---- corner leaves -------------------------------------------
          Cropped by the viewport edges on purpose. Placed in the outer
          margins, never behind a column of text — at these opacities they
          would not obscure copy, but they would make it look smudged. */}
      <LeafCluster side="left" className="left-[-46px] top-[5%] hidden md:block" />
      <SingleLeaf className="right-[-30px] top-[19%] w-[150px] h-[150px] rotate-[168deg] hidden lg:block" />
      <SingleLeaf className="left-[-24px] top-[34%] w-[124px] h-[124px] rotate-[38deg] hidden lg:block" />
      <LeafCluster side="right" className="right-[-52px] top-[54%] hidden lg:block" />
      <SingleLeaf className="left-[-30px] top-[71%] w-[140px] h-[140px] rotate-[24deg] hidden lg:block" />
      <SingleLeaf className="right-[-26px] top-[88%] w-[132px] h-[132px] rotate-[196deg] hidden md:block" />
    </div>
  );
}
