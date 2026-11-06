import { Link } from "react-router-dom";
import { ArrowUpRight, Smartphone, Store } from "lucide-react";
import LandingHeader from "../components/landing/LandingHeader";
import LandingFooter from "../components/landing/LandingFooter";
import "../styles/paper.css";

export default function AuthEntry() {
  return (
    <div className="paper-theme paper-page">
      <LandingHeader />
      <main id="main-content" className="paper-wrap auth-choice-layout">
        <div className="auth-choice-heading">
          <p className="paper-kicker">A place for every side of the counter</p>
          <h1>
            How will you
            <br />
            use Paprout?
          </h1>
        </div>
        <div className="auth-choices">
          <Link to="/auth/get-app" className="auth-choice">
            <div className="auth-choice-art">
              <img
                src="/art/themes/pickup-cmyk.webp"
                width="1024"
                height="1536"
                alt=""
              />
            </div>
            <div className="auth-choice-copy">
              <span>
                <Smartphone size={18} />I need something printed
              </span>
              <p>Order from nearby print shops with the Paprout mobile app.</p>
              <strong>
                Get the app <ArrowUpRight size={20} />
              </strong>
            </div>
          </Link>
          <Link to="/print-partners" className="auth-choice">
            <div className="auth-choice-art partner-choice-art">
              <img
                src="/art/themes/shopkeeper-cmyk.webp"
                width="1024"
                height="1536"
                alt=""
              />
            </div>
            <div className="auth-choice-copy">
              <span>
                <Store size={18} />I run a print shop
              </span>
              <p>
                Manage incoming orders, set your pricing and organise pickups.
              </p>
              <strong>
                Explore for shops <ArrowUpRight size={20} />
              </strong>
            </div>
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
