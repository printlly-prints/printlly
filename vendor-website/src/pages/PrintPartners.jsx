import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ClipboardList,
  SlidersHorizontal,
  KeyRound,
} from "lucide-react";
import LandingHeader from "../components/landing/LandingHeader";
import LandingFooter from "../components/landing/LandingFooter";
import { useAuth } from "../context/AuthContext";

const TOOLS = [
  [
    ClipboardList,
    "Keep orders in view",
    "Accept paid orders, open the documents and mark prints ready for pickup.",
  ],
  [
    SlidersHorizontal,
    "Set your own prices",
    "Manage rates for colour, paper sizes, sides and the finishing services you offer.",
  ],
  [
    KeyRound,
    "Hand over with confidence",
    "Check the customer’s pickup code before completing the order.",
  ],
];

export default function PrintPartners() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="paper-theme paper-page">
      <LandingHeader />
      <main id="main-content" className="paper-wrap partner-page">
        <div className="partner-intro">
          <div className="partner-copy">
            <p className="paper-kicker">Paprout for print shops</p>
            <h1>
              Your print shop,
              <br />
              connected.
            </h1>
            <p>
              Keep doing what you do best. Let customers send their files before
              they reach your counter, with print preferences and payment
              already sorted.
            </p>
            <div className="paper-actions">
              <Link
                className="paper-button"
                to={isAuthenticated ? "/app" : "/auth/vendor?mode=signup"}
              >
                {isAuthenticated
                  ? "Open your dashboard"
                  : "Create partner account"}{" "}
                <ArrowUpRight size={18} />
              </Link>
              {!isAuthenticated && (
                <Link className="paper-text-link" to="/auth/vendor">
                  Partner sign-in <ArrowUpRight size={18} />
                </Link>
              )}
            </div>
            <p className="partner-caption">
              You set the prices. Customers collect at your shop.
            </p>
          </div>
          <div className="partner-portrait">
            <img
              src="/art/themes/shopkeeper-cmyk.webp"
              width="1024"
              height="1536"
              alt="Paprout’s print partner holding a finished order"
            />
            <span>Good prints. Great partnerships.</span>
          </div>
        </div>
        <div
          className="partner-tools"
          aria-label="Your partner dashboard tools"
        >
          {TOOLS.map(([Icon, title, text]) => (
            <div key={title}>
              <Icon size={24} />
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <section
          className="partner-setup"
          aria-labelledby="partner-setup-title"
        >
          <div>
            <p className="paper-kicker">From sign-up to your first order</p>
            <h2 id="partner-setup-title">
              A clear start
              <br />
              for your shop.
            </h2>
            <a href="/faq#partners" className="paper-text-link">
              Partner questions <ArrowUpRight size={17} />
            </a>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Create your account</h3>
                <p>
                  Use your email or continue with Google. Already a partner?
                  Sign in to return to your dashboard.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Make it your shop</h3>
                <p>
                  Add your shop details, photos and verification documents, then
                  set your printing rates and payout details.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Get ready for orders</h3>
                <p>
                  Your shop becomes visible after administrator approval. Manage
                  incoming orders, printing and pickups from your dashboard.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <div className="partner-support">
          <p>Questions about verification or getting started?</p>
          <a href="/contact#vendor" className="paper-text-link">
            Partner support <ArrowUpRight size={17} />
          </a>
          <Link to="/vendor-terms" className="paper-text-link">
            Read partner terms <ArrowUpRight size={17} />
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
