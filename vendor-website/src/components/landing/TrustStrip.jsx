import Reveal from "./Reveal";
const AUDIENCES = [
  {
    label: "Students",
    icon: (
      <>
        <path d="M3 9.5 12 5l9 4.5-9 4.5z" />
        <path d="M7 11.6V16c0 1.4 2.2 2.6 5 2.6s5-1.2 5-2.6v-4.4" />
        <path d="M21 9.5V15" />
      </>
    ),
  },
  {
    label: "Office Professionals",
    icon: (
      <>
        <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
        <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
        <path d="M3 12.5h18" />
      </>
    ),
  },
  {
    label: "Small Businesses",
    icon: (
      <>
        <path d="M4 9h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
        <path d="M4 9 5.5 4h13L20 9" />
        <path d="M10 20.5V14h4v6.5" />
      </>
    ),
  },
  {
    label: "Educational Institutes",
    icon: (
      <>
        <path d="M3 10 12 5l9 5" />
        <path d="M5 10v9M10 10v9M14 10v9M19 10v9" />
        <path d="M3 20h18" />
      </>
    ),
  },
];

export default function TrustStrip() {
  return (
    // Transparent, and without the rules it used to carry above and
    // below: a full-width white band between two tinted ones was exactly
    // the hard section reset this page is meant not to have.
    <section className="relative">
      <Reveal className="max-w-[1180px] mx-auto px-5 sm:px-6 py-11">
        <p className="text-center text-[11px] font-semibold tracking-[0.16em] uppercase text-text-muted">
          Trusted by students, professionals and businesses
        </p>

        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-8 lg:gap-x-12 gap-y-2 sm:gap-y-4">
          {AUDIENCES.map((a) => (
            <li
              key={a.label}
              className="group flex items-center gap-2 sm:gap-2.5 rounded-control px-2 sm:px-3 py-2 transition-[transform,background-color] duration-200 ease-out hover:-translate-y-1 hover:bg-primary-wash/60"
            >
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-text-secondary transition-colors duration-200 group-hover:text-primary-bright"
              >
                {a.icon}
              </svg>
              <span className="text-[14px] font-semibold text-text-secondary transition-colors duration-200 group-hover:text-text-primary">
                {a.label}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
