import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  Smartphone,
} from "lucide-react";
import LandingHeader from "../components/landing/LandingHeader";
import LandingFooter from "../components/landing/LandingFooter";
import "../styles/paper.css";

function configuredUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
const DOWNLOAD = configuredUrl(import.meta.env.VITE_APP_DOWNLOAD_URL);
const PLAY = configuredUrl(import.meta.env.VITE_GOOGLE_PLAY_URL);
const APPLE = configuredUrl(import.meta.env.VITE_APP_STORE_URL);

export default function GetApp() {
  const qrValue = DOWNLOAD || PLAY || APPLE;
  return (
    <div className="paper-theme paper-page">
      <LandingHeader />
      <main id="main-content" className="paper-wrap download-layout">
        <div className="download-copy">
          <Link to="/" className="paper-text-link back-link">
            <ArrowLeft size={16} />
            Back to Printlly
          </Link>
          <p className="paper-kicker">Your print desk, in your pocket</p>
          <h1>
            Less running around.
            <br />
            More printing sorted.
          </h1>
          <p>
            Choose your files, set your preferences and find a nearby shop.
            Printlly takes care of the back-and-forth.
          </p>
          <div className="download-features">
            <span>
              <Check size={17} />
              Configure each document
            </span>
            <span>
              <Check size={17} />
              Compare your order’s price
            </span>
            <span>
              <Check size={17} />
              Collect with your pickup code
            </span>
          </div>
          {qrValue ? (
            <div className="download-options">
              <div className="download-qr">
                <QRCodeSVG
                  value={qrValue}
                  size={124}
                  bgColor="#FFFFFF"
                  fgColor="#242426"
                  marginSize={2}
                />
                <span>Scan to get Printlly</span>
              </div>
              <div className="download-links">
                {DOWNLOAD && (
                  <a
                    href={DOWNLOAD}
                    className="paper-button"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={17} />
                    Download Printlly <ArrowUpRight size={17} />
                  </a>
                )}
                {PLAY && (
                  <a
                    href={PLAY}
                    className="paper-store-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Smartphone size={18} />
                    Get it on Google Play <ArrowUpRight size={17} />
                  </a>
                )}
                {APPLE && (
                  <a
                    href={APPLE}
                    className="paper-store-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Smartphone size={18} />
                    Download on the App Store <ArrowUpRight size={17} />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="download-unavailable" role="status">
              <span>
                <Smartphone size={21} />
              </span>
              <div>
                <strong>The app download isn’t available yet</strong>
                <p>
                  Check back here for the download link. Already a print
                  partner? <Link to="/auth/vendor">Sign in to your shop.</Link>
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="download-art">
          <span className="download-art-paper" aria-hidden="true" />
          <img
            src="/art/themes/student-cmyk.webp"
            width="1024"
            height="1536"
            alt="Printlly’s illustrated student using her phone while carrying documents"
          />
          <span className="download-art-label">Your files. Your way.</span>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
