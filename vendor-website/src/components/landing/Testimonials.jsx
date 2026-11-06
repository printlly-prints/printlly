import { SectionLabel, CARD_HOVER } from "./primitives";
import Reveal from "./Reveal";

// Initials avatars rather than photographs. The reference uses portrait
// photos, but these are illustrative testimonials — pairing invented
// quotes with real-looking faces of people who didn't say them is the
// one shortcut worth refusing here.
const TESTIMONIALS = [
  {
    quote:
      "Paprout has made my college life so much easier. No more standing in long queues!",
    name: "Riya Sharma",
    role: "Student",
    initials: "RS",
  },
  {
    quote:
      "Super convenient for office work. I just upload, pay, and pick up on my way back.",
    name: "Amit Verma",
    role: "Marketing Professional",
    initials: "AV",
  },
  {
    quote:
      "Great platform with reliable shops and transparent pricing. Highly recommended.",
    name: "Neha Kapoor",
    role: "Small Business Owner",
    initials: "NK",
  },
];

function Stars() {
  return (
    <span className="flex gap-0.5" aria-label="Rated 5 out of 5">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="#F5A623" aria-hidden="true">
          <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" />
        </svg>
      ))}
    </span>
  );
}

export default function Testimonials() {
  return (
    <section className="relative">
      <div className="max-w-[1180px] mx-auto px-5 sm:px-6 py-16 lg:py-20">
        <Reveal className="text-center">
          <SectionLabel>What our users say</SectionLabel>
          <h2 className="mt-5 font-heading font-bold text-text-primary tracking-[-0.03em] text-[30px] leading-[1.2] sm:text-[36px]">
            Loved by thousands
          </h2>
          <p className="mt-3.5 text-[15px] text-text-secondary">Real stories from our community.</p>
        </Reveal>

        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal as="li" key={t.name} delay={i * 110} className="h-full">
              <div
                className={`group h-full bg-surface border border-border rounded-panel p-6 flex flex-col ${CARD_HOVER}`}
              >
              <div className="flex items-start gap-3.5">
                <span className="w-11 h-11 shrink-0 rounded-full bg-primary-wash flex items-center justify-center font-heading text-[14px] font-bold text-primary-bright transition-[background-color,color] duration-200 group-hover:bg-primary group-hover:text-white">
                  {t.initials}
                </span>
                <blockquote className="text-[13.5px] leading-[1.65] text-text-primary">
                  “{t.quote}”
                </blockquote>
              </div>

              <div className="mt-5 flex items-end justify-between gap-3">
                <div>
                  <p className="font-heading text-[14px] font-bold text-text-primary">{t.name}</p>
                  <p className="mt-0.5 text-[12px] text-text-muted">{t.role}</p>
                </div>
                <Stars />
              </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
