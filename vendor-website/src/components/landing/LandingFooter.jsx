import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { PaperWordmark } from "./LandingHeader";
import "../../styles/paper.css";

const LINKS = [
  {
    title: "Printlly",
    links: [
      ["About us", "/about"],
      ["Get the app", "/auth/get-app"],
      ["Print partners", "/auth/vendor"],
      ["Help & questions", "/faq"],
    ],
  },
  {
    title: "The details",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Refunds", "/refund-policy"],
      ["Pickup policy", "/delivery-policy"],
    ],
  },
  {
    title: "Here to help",
    links: [
      ["Contact us", "/contact"],
      ["Payment & billing", "/payment-billing"],
      ["Data deletion", "/data-deletion"],
      ["Partner terms", "/vendor-terms"],
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer className="paper-theme paper-footer">
      <div className="paper-wrap">
        <div className="footer-top">
          <div>
            <p className="paper-kicker">Ready when you are</p>
            <h2>
              Good things
              <br />
              come in print.
            </h2>
          </div>
          <Link to="/auth/get-app" className="paper-button">
            Get Printlly <ArrowUpRight size={20} />
          </Link>
        </div>
        <div className="footer-main">
          <div className="footer-brand">
            <Link to="/" aria-label="Printlly home">
              <PaperWordmark />
            </Link>
            <p>
              Your files. Your neighbourhood.
              <br />
              One less thing on your list.
            </p>
            <div
              className="print-swatches"
              aria-label="Cyan, magenta, yellow and black print inks"
            >
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          {LINKS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h3>{group.title}</h3>
              {group.links.map(([label, to]) => (
                <Link key={to} to={to}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Printlly</span>
          <span>Made for your everyday paperwork.</span>
          <Link to="/cookie-policy">Cookie policy</Link>
        </div>
      </div>
    </footer>
  );
}
