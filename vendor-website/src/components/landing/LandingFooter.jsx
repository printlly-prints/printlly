import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { PaperWordmark } from "./LandingHeader";
import "../../styles/paper.css";

const LINKS = [
  {
    title: "Paprout",
    links: [
      ["About us", "/about"],
      ["Get the app", "/auth/get-app"],
      ["For print shops", "/print-partners"],
      ["Partner sign-in", "/auth/vendor"],
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
            <h2 lang="hi-Latn">
              Print karna hai?
              <br />
              Paprout pe bhej de
            </h2>
          </div>
          <Link to="/auth/get-app" className="paper-button">
            Get Paprout <ArrowUpRight size={20} />
          </Link>
        </div>
        <div className="footer-main">
          <div className="footer-brand">
            <Link to="/" aria-label="Paprout home">
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
          <span>© {new Date().getFullYear()} Paprout</span>
          <span>Made for your everyday paperwork.</span>
          <Link to="/cookie-policy">Cookie policy</Link>
        </div>
      </div>
    </footer>
  );
}
