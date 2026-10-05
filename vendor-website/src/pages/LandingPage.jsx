import LandingHeader from "../components/landing/LandingHeader";
import PageBackdrop from "../components/landing/PageBackdrop";
import Hero from "../components/landing/Hero";
import TrustStrip from "../components/landing/TrustStrip";
import Features from "../components/landing/Features";
import HowItWorks from "../components/landing/HowItWorks";
import ShopGrid from "../components/landing/ShopGrid";
import AppPromo from "../components/landing/AppPromo";
import Testimonials from "../components/landing/Testimonials";
import FinalCTA from "../components/landing/FinalCTA";
import LandingFooter from "../components/landing/LandingFooter";

// Public marketing page at "/". Not gated behind auth - see App.jsx,
// where the authenticated equivalent lives at "/app".
//
// Section order is fixed by the design and each section owns its own
// spacing, so reordering here is all that's needed to move one.
export default function LandingPage() {
  return (
    // The page is the positioning context for PageBackdrop, which is
    // absolutely inset to the full document height. overflow-x-clip guards
    // against the decorative art widening the document on narrow screens.
    //
    // The sections below paint no ground of their own - the backdrop is
    // the only background on this page, which is what makes it continuous.
    <div className="relative bg-background min-h-screen scroll-smooth overflow-x-clip">
      <PageBackdrop />
      <LandingHeader />
      <main className="relative">
        <Hero />
        <TrustStrip />
        <Features />
        <HowItWorks />
        <ShopGrid />
        <AppPromo />
        <Testimonials />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
