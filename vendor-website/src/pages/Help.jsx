import PublicShell, { PaperRow } from "../components/PublicShell";
import { PaperPanel } from "../components/PaperUI";

/** Active W06, with existing policy/support destinations. */
export default function Help() {
  return <PublicShell title="Help & policies">
    <h1 className="workspace-title">Help for your<br />next print.</h1>
    <PaperPanel><h2>Payment</h2><p>UPI is the only payment method. Return to Printlly to check confirmation before paying again.</p></PaperPanel>
    <PaperPanel><h2>Collection</h2><p>Wait for Ready for pickup. Your six-digit pickup code appears only after payment is confirmed.</p></PaperPanel>
    <PaperPanel className="journey-panel"><h2>Policies</h2><PaperRow to="/privacy" title="Privacy" detail="View the current privacy policy" /><PaperRow to="/terms" title="Terms" detail="View the current terms of service" /><PaperRow to="/contact" title="Contact support" detail="Get help with an order" /></PaperPanel>
    <PaperRow to="/faq" title="Frequently asked questions" detail="More about ordering, payments and collection" />
  </PublicShell>;
}
