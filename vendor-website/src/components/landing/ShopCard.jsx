import { Link } from "react-router-dom";
import { CARD_HOVER, ArrowRight } from "./primitives";

function Star() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#F5A623" aria-hidden="true">
      <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" />
    </svg>
  );
}

export default function ShopCard({ shop }) {
  const open = shop.status === "open";

  return (
    // The <li> lives on the Reveal wrapper in ShopGrid, so this is a div.
    <div
      className={`group h-full bg-surface border border-border rounded-panel overflow-hidden flex flex-col ${CARD_HOVER}`}
    >
      {/* Own stacking context so the zoomed art stays clipped by the
          card's rounded corners. */}
      <div className="relative overflow-hidden">
        <img
          src={shop.image}
          width="800"
          height="533"
          loading="lazy"
          decoding="async"
          alt={`Shopfront of ${shop.name}`}
          className="w-full h-[152px] object-cover object-center transition-transform duration-300 ease-out group-hover:scale-[1.04]"
        />
        {/* Photographs carry their own busy detail, so the scrim is
            heavier than it was under the flat illustration - it keeps the
            bottom edge from fighting the shop name directly below it. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,rgba(18,51,38,.34),transparent)]"
        />
      </div>

      <div className="p-5 flex flex-col gap-2.5 flex-1">
        <h3 className="font-heading text-[17px] font-bold text-text-primary">{shop.name}</h3>

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] text-text-primary">
            <Star />
            <span className="font-semibold">{shop.rating}</span>
            <span className="text-text-muted">({shop.reviews})</span>
          </span>
          <span className="flex items-center gap-1 text-[12.5px] text-text-muted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s7-6.4 7-11.4A7 7 0 0 0 5 9.6C5 14.6 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.4" />
            </svg>
            {shop.distance}
          </span>
        </div>

        {/* Status carries a word as well as a colour, so it reads without
            relying on the green/amber dot alone. */}
        <span
          className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${
            open ? "text-success-text" : "text-status-pending-text"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${open ? "bg-success" : "bg-status-pending-text"}`}
          />
          {shop.statusLabel}
        </span>

        <div className="pt-1 flex flex-col gap-1 text-[12.5px] text-text-secondary">
          <span>
            B&amp;W from <span className="font-semibold text-text-primary">{shop.bw}</span>
          </span>
          <span>
            Color from <span className="font-semibold text-text-primary">{shop.color}</span>
          </span>
        </div>

        <span className="flex items-center gap-1.5 text-[12.5px] text-text-muted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Ready in {shop.prep}
        </span>

        <div className="mt-auto pt-3">
          <Link
            to="/auth/get-app"
            className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-control border border-border text-[13.5px] font-heading font-bold text-primary-bright transition-[background-color,border-color,color,box-shadow] duration-200 group-hover:border-primary group-hover:bg-primary group-hover:text-white group-hover:shadow-cta focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            View Shop
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
