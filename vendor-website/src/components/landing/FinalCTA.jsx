import { CTA, ArrowRight } from "./primitives";
import Reveal from "./Reveal";
import { SingleLeaf } from "./illustrations/Leaves";

// The paper stack in the CTA panel, carrying a handwritten note and the
// Paprout mark — the same "printed locally" idea the hero sheet uses.
function PaperStack({ className = "" }) {
  return (
    <svg viewBox="0 0 300 230" className={className} role="img" aria-label="A stack of printed pages">
      <defs>
        <filter id="cta-soft" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="10" stdDeviation="11" floodColor="#0F3B2A" floodOpacity="0.13" />
        </filter>
      </defs>

      <g filter="url(#cta-soft)">
        <rect x="44" y="46" width="196" height="150" rx="9" fill="#FFFFFF" opacity=".55" transform="rotate(-7 142 121)" />
        <rect x="52" y="40" width="196" height="152" rx="9" fill="#FFFFFF" opacity=".8" transform="rotate(-3 150 116)" />
        <rect x="58" y="34" width="196" height="156" rx="9" fill="#FFFFFF" />
      </g>

      <text x="80" y="72" fontFamily="Caveat, cursive" fontSize="25" fontWeight="700" fill="#123326">Ideas</text>
      <text x="80" y="102" fontFamily="Caveat, cursive" fontSize="25" fontWeight="700" fill="#123326">Documents</text>
      <text x="80" y="132" fontFamily="Caveat, cursive" fontSize="25" fontWeight="700" fill="#123326">Dreams</text>
      <text x="80" y="162" fontFamily="Caveat, cursive" fontSize="25" fontWeight="700" fill="#087F8C">Printed Locally</text>

      <g transform="translate(80 172)">
        <rect width="16" height="16" rx="5" fill="#087F8C" />
        <path d="M5.2 3.6h3.2l2.1 2.1v3.8H5.2z" fill="#FFFFFF" />
        <rect x="3.6" y="9.5" width="8.8" height="3.3" rx="1.3" fill="#FFFFFF" opacity=".62" />
        <text x="21" y="12.8" fontFamily="'Plus Jakarta Sans', sans-serif" fontSize="11.5" fontWeight="800" fill="#123326">Paprout</text>
      </g>

      {/* sparkle marks */}
      <g stroke="#0EA5A8" strokeWidth="2.4" strokeLinecap="round" opacity=".8">
        <path d="M268 62v-12M259 70l-8-8M277 70l8-8" />
        <path d="M32 186v-9M25 192l-6-6" />
      </g>
    </svg>
  );
}

export default function FinalCTA() {
  return (
    <section className="relative">
      <div className="max-w-[1180px] mx-auto px-5 sm:px-6 pb-16 lg:pb-20">
        <Reveal className="relative overflow-hidden rounded-hero border border-border-strong shadow-[0_18px_50px_-24px_rgba(0,0,0,.55)] bg-[linear-gradient(135deg,#123B35_0%,#113A2D_52%,#0E3326_100%)] px-7 py-12 sm:px-12 lg:px-14 lg:py-14 grid lg:grid-cols-[1fr_auto] gap-10 items-center">
          {/* soft abstract shapes */}
          <span aria-hidden="true" className="absolute -top-24 -left-16 w-64 h-64 rounded-full bg-white/[0.05]" />
          <span aria-hidden="true" className="drift-slow absolute -bottom-28 left-1/3 w-72 h-72 rounded-full bg-white/[0.035]" />
          <span
            aria-hidden="true"
            className="float-slower absolute -right-10 -top-16 w-56 h-56 rounded-full bg-leaf/[0.14] blur-2xl"
          />
          <SingleLeaf className="left-2 bottom-2 w-[132px] h-[132px] rotate-[28deg] hidden sm:block" />

          <div className="relative max-w-[600px]">
            <span className="inline-block px-3 py-1.5 rounded-full bg-surface/80 text-primary-bright text-[11px] font-bold tracking-[0.14em] uppercase">
              Ready to get started?
            </span>

            <h2 className="mt-5 font-heading font-bold text-text-primary tracking-[-0.03em] text-[28px] leading-[1.18] sm:text-[34px]">
              Your next print is just a few taps away.
            </h2>
            <p className="mt-3.5 text-[15px] leading-[1.65] text-text-secondary">
              Upload your document today and skip the printing queue.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <CTA to="/auth/get-app">
                Upload Document <ArrowRight />
              </CTA>
              <CTA to="#shops" variant="ghostOnTeal">
                Find a Shop
              </CTA>
            </div>
          </div>

          <PaperStack className="float-slow relative w-[260px] sm:w-[330px] h-auto justify-self-center lg:justify-self-end" />
        </Reveal>
      </div>
    </section>
  );
}
