import PublicShell from "../components/PublicShell";
import { Artwork, Button, PaperPanel } from "../components/PaperUI";

/** Active Figma W03; existing customer app and partner route contracts. */
export default function AuthEntry() {
  return (
    <PublicShell title="Choose your workspace">
      <h1 className="workspace-title">A place for<br />every print.</h1>
      <PaperPanel className="workspace-choice">
        <div className="workspace-choice-heading"><h2>I want to print</h2><Artwork name="user-customer" /></div>
        <Button to="/auth/get-app">Get the app</Button>
      </PaperPanel>
      <PaperPanel className="workspace-choice">
        <div className="workspace-choice-heading"><h2>I run a print shop</h2><Artwork name="vendor" /></div>
        <Button to="/auth/vendor">Partner sign in</Button>
      </PaperPanel>
    </PublicShell>
  );
}
