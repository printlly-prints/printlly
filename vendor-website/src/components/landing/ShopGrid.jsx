import { Link } from "react-router-dom";
import { SectionLabel, ArrowRight } from "./primitives";
import ShopCard from "./ShopCard";
import Reveal from "./Reveal";

// DEMONSTRATION CONTENT ONLY — not wired to the API, and deliberately so.
//
// GET /shops does return real shops, but only shop_name, address and
// contact. Rating, review count, distance, open/closed hours, per-page
// rates and preparation time have no backend behind them yet, so a live
// fetch here could not fill this card. Rather than render a half-empty
// card or invent values at runtime, the marketing page shows a static
// sample and says so in the caption below the grid.
//
// When the backend grows those fields: delete this array, fetch /shops,
// and map the response into <ShopCard shop={...} />. The card's props
// already match the shape one would return.
const SAMPLE_SHOPS = [
  {
    name: "CopyHub",
    image: "/shops/copyhub.jpg",
    rating: "4.8",
    reviews: 320,
    distance: "1.2 km",
    status: "open",
    statusLabel: "Open Now",
    bw: "₹1/page",
    color: "₹5/page",
    prep: "~10 min",
  },
  {
    name: "PrintPoint",
    image: "/shops/printpoint.jpg",
    rating: "4.6",
    reviews: 210,
    distance: "2.4 km",
    status: "open",
    statusLabel: "Open Now",
    bw: "₹1/page",
    color: "₹6/page",
    prep: "~15 min",
  },
  {
    // Named for the shop on its signage, so the card and the photograph
    // agree — this slot used to read "The Print Store".
    name: "Crystal Print",
    image: "/shops/crystal-print.jpg",
    rating: "4.7",
    reviews: 180,
    distance: "3.1 km",
    status: "open",
    statusLabel: "Open Now",
    bw: "₹1/page",
    color: "₹5/page",
    prep: "~12 min",
  },
  {
    name: "QuickPrint",
    image: "/shops/quickprint.jpg",
    rating: "4.5",
    reviews: 120,
    distance: "4.0 km",
    status: "closing",
    statusLabel: "Closes at 9 PM",
    bw: "₹1/page",
    color: "₹6/page",
    prep: "~20 min",
  },
];

export default function ShopGrid() {
  return (
    <section id="shops" className="relative overflow-hidden">
      {/* Organic shapes behind the grid. Readability is safe by
          construction: the cards are opaque white and paint over these,
          so nothing here can ever sit between a shop's details and the
          reader - it only fills the gutters between and around them. */}
      <span
        aria-hidden="true"
        className="drift-slow pointer-events-none absolute -left-32 top-[22%] w-[460px] h-[460px] rounded-[46%_54%_58%_42%/48%_44%_56%_52%] bg-leaf/[0.12] blur-3xl"
      />
      <span
        aria-hidden="true"
        className="float-slower pointer-events-none absolute -right-24 bottom-[6%] w-[400px] h-[400px] rounded-[58%_42%_46%_54%/52%_58%_42%_48%] bg-primary-accent/[0.10] blur-3xl"
      />

      <div className="relative max-w-[1180px] mx-auto px-5 sm:px-6 py-16 lg:py-20">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionLabel>Explore</SectionLabel>
            <h2 className="mt-5 font-heading font-bold text-text-primary tracking-[-0.03em] text-[30px] leading-[1.2] sm:text-[36px]">
              Nearby Print Shops
            </h2>
            <p className="mt-3 text-[15px] text-text-secondary">
              Discover trusted print shops around you.
            </p>
          </div>

          <Link
            to="/auth/get-app"
            className="inline-flex items-center gap-1.5 text-[14px] font-heading font-bold text-primary-bright hover:text-primary-deep transition-colors duration-200"
          >
            See All Shops <ArrowRight className="w-4 h-4" />
          </Link>
        </Reveal>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SAMPLE_SHOPS.map((shop, i) => (
            <Reveal as="li" key={shop.name} delay={i * 90} className="h-full">
              <ShopCard shop={shop} />
            </Reveal>
          ))}
        </ul>

        <p className="mt-7 text-[12.5px] text-text-muted">
          Shops shown for illustration. Ratings, distances and prices are sample values — live
          listings open in the Printlly app.
        </p>
      </div>
    </section>
  );
}
