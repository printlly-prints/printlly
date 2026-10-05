import LegalPage, { Section, P, List, Note } from "../../components/legal/LegalPage";
import { SUPPORT_EMAIL } from "../../config/legal";

const TOC = [
  { id: "summary", title: "Summary" },
  { id: "what-we-use", title: "What this site stores" },
  { id: "app", title: "The mobile app" },
  { id: "not-used", title: "What we do not use" },
  { id: "third-party", title: "Third-party pages" },
  { id: "control", title: "Clearing stored data" },
  { id: "changes", title: "Changes" },
];

export default function Cookies() {
  return (
    <LegalPage
      title="Cookie Policy"
      description="Printlly does not use cookies, analytics or tracking. What it does store in your browser."
      toc={TOC}
      intro={
        <P>
          Most cookie policies are long because most sites track their visitors.
          This one is short because Printlly does not.
        </P>
      }
    >
      <Section id="summary" number="1" title="Summary">
        <Note>
          Printlly does not set cookies, and does not use analytics,
          advertising or tracking of any kind. This website stores two values in
          your browser, both required for you to stay signed in, and neither
          used to follow you anywhere.
        </Note>
      </Section>

      <Section id="what-we-use" number="2" title="What this site stores">
        <P>
          The print partner dashboard uses your browser's{" "}
          <strong className="text-text-primary">local storage</strong>, not
          cookies. Local storage differs from a cookie in a way that matters
          here: it is never attached to outgoing requests automatically, so it
          cannot be read by other sites or sent anywhere we did not explicitly
          send it.
        </P>
        <List>
          <li>
            <strong className="text-text-primary">token</strong> - your signed
            session token. Without it you would be signed out every time the
            page reloads. It is sent to the Printlly API with each request to
            prove who you are.
          </li>
          <li>
            <strong className="text-text-primary">user</strong> - your name,
            email, phone and role, so the dashboard can render your account
            without an extra request on every page load.
          </li>
        </List>
        <P>
          Both are removed when you sign out. Both are strictly necessary for
          the dashboard to function, which is why there is no consent banner
          asking you to opt in to them - there is nothing optional to consent
          to.
        </P>
      </Section>

      <Section id="app" number="3" title="The mobile app">
        <P>
          The Printlly customer app is not a website and does not use cookies at
          all. It stores your session token, your account details and your push
          notification token on your device, so you stay signed in and can be
          notified about your orders. Uninstalling the app removes them.
        </P>
      </Section>

      <Section id="not-used" number="4" title="What we do not use">
        <List>
          <li>No analytics - no Google Analytics, no product analytics tooling.</li>
          <li>No advertising or remarketing pixels.</li>
          <li>No social media tracking pixels.</li>
          <li>No session recording or heatmap tools.</li>
          <li>No third-party cookies.</li>
          <li>No cross-site or cross-device tracking.</li>
        </List>
        <P>
          This is a statement of what the software currently contains, not a
          policy promise about the future. If we ever add analytics, this page
          will be updated to say so before it ships.
        </P>
      </Section>

      <Section id="third-party" number="5" title="Third-party pages">
        <P>
          Two parts of the experience are not served by us, and are governed by
          their own policies:
        </P>
        <List>
          <li>
            <strong className="text-text-primary">Razorpay checkout</strong>,
            where you enter payment details.
          </li>
          <li>
            <strong className="text-text-primary">Google Sign-In</strong>, if
            you are a print partner signing in with Google.
          </li>
        </List>
        <P>
          Both may set their own cookies on their own pages. We have no control
          over, and no access to, what they store.
        </P>
      </Section>

      <Section id="control" number="6" title="Clearing stored data">
        <P>
          Signing out clears what the dashboard has stored. You can also clear
          site data for this site at any time through your browser's settings -
          the effect is simply that you are signed out and will need to sign in
          again.
        </P>
      </Section>

      <Section id="changes" number="7" title="Changes">
        <P>
          If this changes, this page changes with it. Questions:{" "}
          {SUPPORT_EMAIL}.
        </P>
      </Section>
    </LegalPage>
  );
}
