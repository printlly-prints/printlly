// Two phone frames showing the actual Paprout customer app screens —
// Home and Ready-for-pickup — rebuilt as markup rather than dropped in
// as screenshots, so they stay sharp at any size and track the real UI
// if it changes. Decorative as a whole: the surrounding section states
// what the app does in real text.

function Frame({ children, className = "" }) {
  return (
    <div
      className={`relative w-[236px] sm:w-[252px] shrink-0 rounded-[30px] bg-[#123326] p-[9px] shadow-[0_34px_70px_-28px_rgba(8,127,140,.55)] ${className}`}
    >
      {/* speaker slot, in place of a painted status bar */}
      <div className="absolute top-[17px] left-1/2 -translate-x-1/2 w-14 h-[5px] rounded-full bg-white/25 z-10" />
      <div className="rounded-[22px] overflow-hidden bg-[#08201A] h-[430px]">{children}</div>
    </div>
  );
}

function HomeScreen() {
  return (
    <div className="pt-7 px-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-primary-wash flex items-center justify-center font-heading text-[12px] font-bold text-primary-bright">
          S
        </span>
        <div className="leading-tight">
          <p className="font-heading text-[12.5px] font-bold text-text-primary">Hello, Shivang 👋</p>
          <p className="text-[9.5px] text-text-secondary">Ready to print something?</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] bg-surface border border-border">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7A938B" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="text-[9.5px] text-text-muted">Search nearby print shops...</span>
      </div>

      <div className="rounded-[13px] bg-primary-wash p-3">
        <p className="font-heading text-[13px] font-extrabold leading-[1.15] text-text-primary">
          Print without
          <br />
          the wait.
        </p>
        <span className="mt-2.5 inline-flex items-center h-7 px-3 rounded-[8px] bg-primary text-white font-heading text-[9.5px] font-bold">
          Upload Document
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {["Upload", "Shops", "Orders", "Saved"].map((l) => (
          <div
            key={l}
            className="rounded-[9px] bg-surface border border-border py-2 flex flex-col items-center gap-1"
          >
            <span className="w-5 h-5 rounded-[6px] bg-primary-wash" />
            <span className="text-[7.5px] text-text-secondary">{l}</span>
          </div>
        ))}
      </div>

      <div>
        <p className="font-heading text-[11px] font-bold text-text-primary">Nearby Shops</p>
        <div className="mt-1.5 flex gap-1.5">
          {/* The same two photographs the Nearby Print Shops grid uses.
              That section renders earlier in the page, so these are served
              from cache rather than costing a second download. */}
          {[
            { n: "CopyHub", img: "/shops/copyhub.jpg" },
            { n: "PrintPoint", img: "/shops/printpoint.jpg" },
          ].map(({ n, img }) => (
            <div key={n} className="flex-1 rounded-[9px] bg-surface border border-border overflow-hidden">
              <img src={img} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-8 w-full object-cover" />
              <div className="px-2 py-1.5">
                <p className="text-[8.5px] font-semibold text-text-primary truncate">{n}</p>
                <p className="text-[7.5px] text-text-muted">1.2 km · ₹1/pg</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PickupScreen() {
  return (
    <div className="pt-7 px-4 flex flex-col items-center text-center">
      <span className="self-start text-text-primary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 6-6 6 6 6" />
        </svg>
      </span>

      <span className="mt-3 w-12 h-12 rounded-full bg-success-bg flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#159A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
          <path d="M4 9 5.5 4h13L20 9" />
          <path d="m9.5 13.5 2 2 3.5-4" />
        </svg>
      </span>

      <p className="mt-3 font-heading text-[15px] font-extrabold leading-tight text-text-primary">
        Your print is ready! 🎉
      </p>
      <p className="mt-1.5 text-[9.5px] text-text-secondary leading-snug">
        CopyHub
        <br />
        Sector 14, Noida
      </p>

      <div className="mt-4 w-full rounded-[13px] border-2 border-primary bg-primary-wash py-4 px-3">
        <p className="text-[8px] font-bold tracking-[0.14em] uppercase text-primary-bright">
          Your Pickup OTP
        </p>
        <p className="mt-1.5 font-heading text-[30px] font-extrabold tracking-[0.14em] text-primary-deep tabular-nums leading-none">
          4827
        </p>
      </div>

      <p className="mt-3 text-[8.5px] leading-snug text-text-secondary px-2">
        Show this OTP to the shop owner to collect your order.
      </p>

      <span className="mt-4 w-full inline-flex items-center justify-center h-9 rounded-[9px] bg-primary text-white font-heading text-[10px] font-bold">
        View Order Details
      </span>
    </div>
  );
}

export default function PhoneMockups() {
  return (
    <div className="flex justify-center lg:justify-end items-start gap-3 sm:gap-5">
      {/* Offset vertical positions plus different float speeds, so the
          pair drifts out of sync rather than moving as one block. */}
      <Frame className="float-slow mt-10">
        <HomeScreen />
      </Frame>
      {/* Two 236px frames don't fit a 390px viewport, and letting them
          overflow widens the whole document — every section then lays
          out to that wider box and clips. One phone below sm instead. */}
      <Frame className="float-slower hidden sm:block">
        <PickupScreen />
      </Frame>
    </div>
  );
}
