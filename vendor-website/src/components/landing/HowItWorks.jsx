import { SectionLabel } from "./primitives";
import Reveal from "./Reveal";

const STEPS = [
  {
    n: "1",
    title: "Upload",
    body: "Upload your document in seconds.",
    icon: (
      <>
        <path d="M6.5 18a4.5 4.5 0 0 1-.5-8.97 6 6 0 0 1 11.6-1.4A4.5 4.5 0 0 1 18 18" />
        <path d="M12 21v-8" />
        <path d="m9 15.5 3-3 3 3" />
      </>
    ),
  },
  {
    n: "2",
    title: "Customize",
    body: "Choose print type, copies, paper size, and more.",
    icon: (
      <>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2.2" />
        <circle cx="10" cy="17" r="2.2" />
      </>
    ),
  },
  {
    n: "3",
    title: "Pay",
    body: "Select a shop and pay securely online.",
    icon: (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
        <path d="M3 10h18" />
        <path d="M7 14.5h3" />
      </>
    ),
  },
  {
    n: "4",
    title: "Pick Up",
    body: "Get notified, show your OTP, and collect your order.",
    icon: (
      <>
        <path d="M4 9h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
        <path d="M4 9 5.5 4h13L20 9" />
        <path d="m9.5 13.5 2 2 3.5-4" />
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden">

      <div className="relative max-w-[1180px] mx-auto px-5 sm:px-6 py-16 lg:py-20">
        <Reveal className="text-center">
          <SectionLabel>How Paprout Works</SectionLabel>
          <h2 className="mt-5 font-heading font-bold text-text-primary tracking-[-0.03em] text-[30px] leading-[1.2] sm:text-[36px]">
            Get your prints in <span className="text-primary-bright">4</span> simple steps
          </h2>
          <p className="mt-3.5 text-[15px] text-text-secondary">
            From upload to pickup — it's that easy.
          </p>
        </Reveal>

        <div className="relative mt-16">
          {/* Connector, drawn left-to-right once the row is in view.
              Desktop only - the list runs vertically below lg. */}
          <Reveal
            lineVariant
            aria-hidden="true"
            className="hidden lg:block absolute top-[23px] left-[12.5%] right-[12.5%] h-0.5 bg-[repeating-linear-gradient(to_right,rgba(8,127,140,.35)_0_7px,transparent_7px_15px)]"
          />

          <ol className="relative grid gap-y-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-6">
            {STEPS.map((s, i) => (
              <Reveal
                as="li"
                key={s.n}
                delay={220 + i * 130}
                className="group flex flex-col items-center text-center"
              >
                <span className="relative inline-flex">
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-primary/35 blur-md opacity-60 transition-opacity duration-200 group-hover:opacity-100"
                  />
                  <span className="relative w-12 h-12 rounded-full bg-[linear-gradient(140deg,#0EA5A8_0%,#087F8C_100%)] text-white font-heading text-[16px] font-extrabold flex items-center justify-center ring-4 ring-white/50 transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:scale-105">
                    {s.n}
                  </span>
                </span>

                <span className="mt-7 flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-110">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#087F8C"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {s.icon}
                  </svg>
                </span>

                <h3 className="mt-4 font-heading text-[17px] font-bold text-text-primary">
                  {s.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-[1.6] text-text-secondary max-w-[190px]">
                  {s.body}
                </p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
