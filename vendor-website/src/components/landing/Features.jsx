import { CARD_HOVER } from "./primitives";
import Reveal from "./Reveal";

const FEATURES = [
  {
    title: "Upload Documents",
    body: "Upload PDF, DOC, JPG, PNG and more supported formats.",
    icon: (
      <>
        <path d="M14 3v5h5" />
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M12 18v-6" />
        <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
      </>
    ),
  },
  {
    title: "Automatic Page Count",
    body: "We automatically detect the number of pages for you.",
    icon: (
      <>
        <path d="M9 3H5a2 2 0 0 0-2 2v4" />
        <path d="M15 3h4a2 2 0 0 1 2 2v4" />
        <path d="M9 21H5a2 2 0 0 1-2-2v-4" />
        <path d="M15 21h4a2 2 0 0 0 2-2v-4" />
        <path d="M8 12h8" />
      </>
    ),
  },
  {
    title: "Secure & Private",
    body: "Your documents are stored temporarily and automatically deleted after printing.",
    icon: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2.5" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  {
    title: "Nearby Print Shops",
    body: "Find and compare nearby shops, prices, ratings and estimated preparation time.",
    icon: (
      <>
        <path d="M4 9h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
        <path d="M4 9 5.5 4h13L20 9" />
        <path d="M10 20.5V14h4v6.5" />
      </>
    ),
  },
];

export default function Features() {
  return (
    // Transparent. This section used to paint a tinted band with a fade
    // at each edge to blend into white neighbours; there are no white
    // neighbours any more, and the backdrop's wash passes through its
    // natural-green stop right here without needing a seam to hide.
    <section id="features" className="relative">
      <div className="relative max-w-[1180px] mx-auto px-5 sm:px-6 py-16 lg:py-20">
        <Reveal>
          <h2 className="text-center font-heading font-bold text-text-primary tracking-[-0.03em] text-[30px] leading-[1.2] sm:text-[36px]">
            Everything you need for a{" "}
            <span className="text-primary-bright">better printing experience</span>
          </h2>
          <p className="mt-3.5 text-center text-[15px] text-text-secondary">
            Simple. Secure. Reliable. That's Paprout.
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal as="li" key={f.title} delay={i * 90} className="h-full">
              <div
                className={`group h-full bg-surface border border-border rounded-panel p-5 ${CARD_HOVER}`}
              >
                {/* Signature interaction: the wash-filled icon tile
                    inverts to solid teal, with a soft glow behind it. */}
                <span className="relative inline-flex">
                  {/* Sits slightly outside the tile and fully rounded, so
                      it reads as a halo rather than a square smudge once
                      the tile scales up. */}
                  <span
                    aria-hidden="true"
                    className="absolute -inset-2 rounded-full bg-primary/25 blur-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  />
                  <span className="relative w-12 h-12 rounded-card bg-primary-wash flex items-center justify-center transition-[background-color,transform] duration-200 ease-out group-hover:bg-primary group-hover:scale-105">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="text-primary-bright transition-colors duration-200 group-hover:text-white"
                    >
                      {f.icon}
                    </svg>
                  </span>
                </span>

                <h3 className="mt-4 font-heading text-[16px] font-bold text-text-primary">
                  {f.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-[1.6] text-text-secondary">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
