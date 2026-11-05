import PublicShell, { PaperRow } from "../components/PublicShell";
import { Artwork, Button, PaperPanel } from "../components/PaperUI";
import BrandOpening from "../components/BrandOpening";

/** Active Figma W01, 81:1871 / 81:1961 / 81:2051. */
export default function LandingPage() {
  return (
    <PublicShell>
      <BrandOpening />
      <section className="public-hero" aria-labelledby="landing-title">
        <div className="public-hero-copy">
          <h1 id="landing-title">Your files.<br />Your neighbourhood.</h1>
          <p>Upload, configure and pay online. Collect your prints from a nearby shop when they’re ready.</p>
          <Button to="/auth">Get Printlly</Button>
        </div>
        <Artwork name="user-customer" className="hero-artwork" />
      </section>
      <PaperPanel id="how-it-works" className="journey-panel">
        <h2>One clear journey</h2>
        <PaperRow to="/auth/get-app" title="Upload PDFs + images" detail="Configure every document before ordering" />
        <PaperRow id="shops" to="/auth/get-app" title="Pick a nearby print shop" detail="Compare prices, availability and queue estimates" />
        <PaperRow to="/help" title="Collect with your pickup code" detail="After payment is confirmed, collect when your order is ready" />
      </PaperPanel>
      <PaperPanel className="print-options-panel">
        <h2>Print the way you need</h2>
        <p>Colour or black &amp; white. Paper size, copies, sides and the shop’s available finishing options.</p>
      </PaperPanel>
      <PaperPanel className="partner-promo-panel">
        <h2>For local print shops</h2>
        <PaperRow to="/auth" title="Your queue, in one place" detail="Accept orders, mark them ready and verify collection" />
      </PaperPanel>
    </PublicShell>
  );
}
