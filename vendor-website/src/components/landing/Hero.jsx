import { CTA, ArrowRight } from "./primitives";
import Reveal from "./Reveal";

const STATS = [
  { value: "500+", label: "Print Shops" },
  { value: "50K+", label: "Happy Customers" },
  { value: "4.8★", label: "Average Rating" },
];

export default function Hero() {
  return (
    // No ground of its own: the page backdrop supplies it, and its top
    // stops (#0D302B into #0A2822) sit between the hero image's own edge
    // tones (#D7F5EF to #FDFEFE), so the artwork has no visible boundary.
    // Those tones are teal-green because public/printer-hero.jpg has its
    // pale ground re-tinted to hue 168 - a shift that leaves the teal
    // printer, the handwriting and the logo untouched.
    <section id="top" className="relative overflow-hidden">
      {/* The backdrop carries the ambient orbs and the corner leaves for
          the whole page now. What stays local to the hero is the teal
          bloom behind the printer, which belongs to the artwork rather
          than to the environment around it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] top-[16%] w-[440px] h-[440px] rounded-full bg-[radial-gradient(circle,rgba(14,165,168,.16)_0%,rgba(14,165,168,0)_68%)]"
      />

      <div className="relative max-w-[1180px] mx-auto px-5 sm:px-6 pt-12 pb-14 lg:pt-14 lg:pb-16 grid lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1fr)] gap-10 lg:gap-6 items-center">
        {/* ---- copy ---- */}
        <Reveal className="max-w-xl">
          <span className="inline-block px-3 py-1.5 rounded-full bg-primary-wash text-primary-bright text-[11px] font-bold tracking-[0.14em] uppercase">
            Your Local Printing Partner
          </span>

          <h1 className="mt-5 font-heading font-bold text-text-primary tracking-[-0.035em] text-[42px] leading-[1.06] sm:text-[52px] lg:text-[56px]">
            Print without
            <br />
            <span className="text-primary-bright">the wait.</span>
          </h1>

          <p className="mt-4 text-[15.5px] leading-[1.65] text-text-secondary max-w-[420px]">
            Upload your documents, choose your preferences, pay online, and pick them up from a
            nearby print shop when they're ready.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CTA to="/auth/get-app">
              Upload &amp; Print <ArrowRight />
            </CTA>
            <CTA to="#shops" variant="outline">
              Find Shops
            </CTA>
          </div>

          {/* Stats get a hover state but stay type-led - a tinted panel
              fades in behind rather than turning them into buttons. */}
          <dl className="mt-9 flex flex-wrap gap-x-3 sm:gap-x-5 gap-y-3 -ml-3">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="group/stat relative rounded-card px-2 sm:px-3 py-2 transition-colors duration-200 hover:bg-surface/70"
              >
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block font-heading text-[26px] font-extrabold text-primary-bright leading-none origin-left transition-transform duration-200 ease-out group-hover/stat:scale-[1.06] group-hover/stat:text-primary-deep">
                    {s.value}
                  </span>
                  <span className="block mt-1.5 text-[13px] text-text-secondary transition-colors duration-200 group-hover/stat:text-text-primary">
                    {s.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {/* ---- illustration ----
            One flat image. It already contains the floating "12 Pages
            Detected" and "Order Ready / OTP" cards and the handwritten
            asides, so there are deliberately no HTML overlays on top —
            adding them back would double every label. The alt text
            carries what the baked-in labels say, since none of that
            text is selectable or reflows. */}
        <Reveal delay={120} className="relative lg:-mr-6 xl:-mr-10">
          {/* Glow pooled under the printer so it sits on the page rather
              than floating on a flat field. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[8%] bottom-[6%] h-[42%] rounded-[50%] bg-[radial-gradient(ellipse,rgba(45,138,90,.18)_0%,rgba(45,138,90,0)_70%)] blur-2xl"
          />
          <img
            src="/printer-hero.jpg"
            width="1400"
            height="933"
            fetchPriority="high"
            alt="A Paprout printer producing a page reading “Good Ideas Print Better”, beside a stack of finished prints. Callouts read “12 Pages Detected” and “Order Ready — OTP 4827”."
            className="float-slow relative w-full h-auto select-none"
            // The image carries its own pale-teal background, a shade off
            // the section's. Feathering the edges lets it bleed into the
            // hero instead of showing as a pasted rectangle. Browsers
            // without mask support just render the full image.
            style={{
              maskImage:
                "linear-gradient(to right, transparent 0%, #000 7%, #000 93%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 8%, #000 92%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, #000 7%, #000 93%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 8%, #000 92%, transparent 100%)",
              maskComposite: "intersect",
              WebkitMaskComposite: "source-in",
            }}
          />
        </Reveal>
      </div>
    </section>
  );
}
