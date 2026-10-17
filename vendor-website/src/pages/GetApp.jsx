import { QRCodeSVG } from "qrcode.react";
import PublicShell, { PaperRow } from "../components/PublicShell";
import { Artwork, Button, PaperPanel } from "../components/PaperUI";

const APP_DOWNLOAD_URL = import.meta.env.VITE_APP_DOWNLOAD_URL;
const GOOGLE_PLAY_URL = import.meta.env.VITE_GOOGLE_PLAY_URL;
const APP_STORE_URL = import.meta.env.VITE_APP_STORE_URL;
const downloadUrl = APP_DOWNLOAD_URL || GOOGLE_PLAY_URL || APP_STORE_URL;

/** Active Figma W02. Unpublished app links stay unavailable. */
export default function GetApp() {
  return (
    <PublicShell title="Get Printlly">
      <section className="public-hero get-app-hero" aria-labelledby="get-app-title">
        <div className="public-hero-copy">
          <h1 id="get-app-title">Your next print<br />starts here.</h1>
          <p>Upload PDFs or images, choose a nearby shop and collect your order.</p>
          <Button href="#app-download">Get Printlly</Button>
        </div>
        <Artwork name="student" className="hero-artwork" />
      </section>
      <PaperPanel id="app-download" className="app-download-panel">
        <h2>Continue on your phone</h2>
        <PaperRow href={downloadUrl} disabled={!downloadUrl} title={downloadUrl ? "Open Printlly" : "App download unavailable"} detail={downloadUrl ? "Continue in the Printlly app" : "There isn’t an app download link available yet."} />
        {downloadUrl && (
          <div className="download-details">
            <div className="download-qr"><QRCodeSVG value={downloadUrl} size={160} bgColor="#FFFFFF" fgColor="#2C1838" title="Scan to open the Printlly app download" /></div>
            <div><p>Scan to continue on your phone.</p><div className="store-links">
              {GOOGLE_PLAY_URL && <Button href={GOOGLE_PLAY_URL} variant="secondary">Google Play</Button>}
              {APP_STORE_URL && <Button href={APP_STORE_URL} variant="secondary">App Store</Button>}
            </div></div>
          </div>
        )}
      </PaperPanel>
    </PublicShell>
  );
}
