// Ambient decoration for the dashboard ground: two soft teal-green
// gradients and a few leaves, well behind the content.
//
// Rules this obeys, because a dashboard is a working surface before it is
// a pretty one:
//   - fixed and inset-0, so it can never extend the page or add a
//     horizontal scrollbar
//   - pointer-events-none, so it cannot intercept a click meant for a row
//   - aria-hidden, so it is not announced
//   - low opacity and behind every panel, so no table cell ever loses
//     contrast against it
//   - transform-free and static: nothing here animates, because motion in
//     the background of a page full of numbers is a distraction
export default function DashboardBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Soft gradient orbs, anchored to opposite corners. */}
      <div
        className="absolute -top-36 -right-28 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-[0.28]"
        style={{ background: "radial-gradient(circle, #0E3034 0%, rgba(14,48,52,0) 70%)" }}
      />
      <div
        className="absolute -bottom-40 -left-32 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-[0.26]"
        style={{ background: "radial-gradient(circle, #0D2A20 0%, rgba(13,42,32,0) 70%)" }}
      />

      {/* An organic curve along the top, the same language as the
          marketing page's waves but far quieter. */}
      <svg
        className="absolute top-0 left-0 w-full h-40 opacity-[0.16]"
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        fill="none"
      >
        <path d="M0 96C240 20 420 140 720 96S1200 12 1440 76V0H0z" fill="#10353A" />
      </svg>

      <Leaf className="absolute top-24 right-[14%] w-16 h-16 opacity-[0.07] rotate-[18deg]" />
      <Leaf className="absolute bottom-32 left-[8%] w-20 h-20 opacity-[0.06] -rotate-[24deg]" />
      <Leaf className="absolute top-[52%] right-[4%] w-12 h-12 opacity-[0.05] rotate-[42deg]" />
    </div>
  );
}

function Leaf({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#2E8B57" strokeWidth="1.4">
      <path d="M12 21c0-7 3-12 9-14-1 8-4 12-9 14z" />
      <path d="M12 21C7 19 4 14 3 6c6 2 9 7 9 14z" />
      <path d="M12 21v-6" strokeLinecap="round" />
    </svg>
  );
}
