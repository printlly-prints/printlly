import LegalPage, { Section, P, List, Note, Sub } from "../../components/legal/LegalPage";
import { LEGAL_BUSINESS_NAME, SUPPORT_EMAIL, GRIEVANCE_EMAIL, FACTS } from "../../config/legal";

const TOC = [
  { id: "scope", title: "Scope" },
  { id: "collect", title: "What we collect" },
  { id: "documents", title: "Your uploaded documents" },
  { id: "retention", title: "Document retention and deletion" },
  { id: "use", title: "How we use information" },
  { id: "third-parties", title: "Third-party services" },
  { id: "payments", title: "Payment information" },
  { id: "sharing", title: "Who your data is shared with" },
  { id: "security", title: "Security and access control" },
  { id: "retention-other", title: "Retention of other data" },
  { id: "rights", title: "Your rights" },
  { id: "deletion", title: "Account and data deletion" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact and grievances" },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="What Paprout collects, how uploaded documents are handled, and when they are deleted."
      toc={TOC}
      intro={
        <>
          <P>
            This policy explains what {LEGAL_BUSINESS_NAME} collects when you
            use Paprout, what we do with it, and when it is deleted. Because
            Paprout handles documents you upload for printing, the sections on
            documents are the most important ones here.
          </P>
          <P>
            It describes what the system actually does. Where a protection is
            partial, or a deletion is scheduled rather than immediate, this
            policy says so rather than rounding up to a reassuring claim.
          </P>
        </>
      }
    >
      <Section id="scope" number="1" title="Scope">
        <P>
          This policy covers the Paprout customer app, the print partner
          dashboard, and the Paprout backend. It does not cover the practices
          of the print shops themselves outside the platform, or of the
          third-party services listed below, each of which has its own policy.
        </P>
      </Section>

      <Section id="collect" number="2" title="What we collect">
        <Sub title="Account information">
          <List>
            <li>Name, phone number and email address.</li>
            <li>
              A password, stored only as a bcrypt hash. We never store your
              password itself and cannot recover or read it.
            </li>
            <li>
              For print partners who sign in with Google: your Google account
              identifier, name and email address, received from Google. No
              password is set for these accounts.
            </li>
          </List>
        </Sub>

        <Sub title="Session information">
          <P>
            When you sign in we issue a signed token and keep a session record
            containing the session's identifier, the account it belongs to, when
            it was created and when it expires. That record is what lets you
            sign out of one device without signing out of the others. It does
            not contain your device name, your IP address or your location.
          </P>
        </Sub>

        <Sub title="Order information">
          <List>
            <li>
              Which shop you ordered from, the print options you chose, the page
              count measured from each document, the filename of each document,
              and the amounts charged.
            </li>
            <li>
              Your pickup OTP, until the order is completed or expires.
            </li>
            <li>The order's status history.</li>
          </List>
        </Sub>

        <Sub title="Location">
          <P>
            The customer app asks for your location so it can show nearby shops
            and sort them by distance. If you decline, the app still works; shops
            are simply not sorted by distance. Your location is used to produce
            that list and is not stored against your account as a location
            history.
          </P>
        </Sub>

        <Sub title="Notifications">
          <P>
            If you allow notifications, we store a push token identifying your
            device, along with the platform (iOS or Android) and when it was
            last used. We do not store your device model, operating system
            version or advertising identifiers.
          </P>
        </Sub>

        <Sub title="Support messages">
          <P>
            Messages you send through in-app support are stored so the
            conversation can be continued and read by our support team.
          </P>
        </Sub>

        <Sub title="Print partner information">
          <P>
            Print partners additionally provide shop name, address, contact
            number, shop photos, location coordinates, an identity document for
            verification, optionally a GST number, and bank or UPI details for
            settlement. Identity documents are stored with restricted access and
            are shown to administrators only through short-lived signed links.
          </P>
        </Sub>

        <Sub title="Logs">
          <P>
            Our servers produce operational logs recording events such as
            payment confirmations and failures, order state changes and errors.
            These contain identifiers - order ids, payment ids - and not
            document contents, passwords, push tokens or payment credentials.
          </P>
        </Sub>

        <Note>
          Paprout does not use cookies, analytics, advertising or tracking
          pixels. See the Cookie Policy for the browser storage that is used.
        </Note>
      </Section>

      <Section id="documents" number="3" title="Your uploaded documents">
        <P>
          This is the part of Paprout that handles the most sensitive material,
          so here is precisely what happens to a document you upload.
        </P>
        <List ordered>
          <li>
            You upload a PDF. It is streamed straight through our server to
            Cloudinary, our storage provider. It is never written to our
            server's disk.
          </li>
          <li>
            Our server reads the file to count its pages, so the order can be
            priced on a real page count rather than one supplied by the app.
          </li>
          <li>
            When you place the order, the document is associated with it and
            becomes available to the one print partner you selected - and to
            nobody else. Another shop cannot reach it.
          </li>
          <li>
            The print partner opens the document through the Paprout dashboard
            in order to print it. The dashboard streams the file through our
            server rather than linking to storage directly, so the raw storage
            address is not exposed to them.
          </li>
          <li>
            When the order is completed, or when it expires, the file is deleted
            from Cloudinary and its record is removed.
          </li>
        </List>
        <P>
          We do not read, open, index, analyse or share the contents of your
          documents. The only automated processing is the page count described
          above.
        </P>
        <Note>
          Being honest about the limit of this: a print partner can see and
          print your document while the order is live, because that is the
          service. They are bound by the Print Partner Terms not to keep,
          copy or use it for anything other than your order, but Paprout
          cannot technically prevent someone from keeping a printed page.
        </Note>
      </Section>

      <Section id="retention" number="4" title="Document retention and deletion">
        <P>
          Deletion is scheduled and automated. It is not instantaneous, and we
          will not claim that it is.
        </P>
        <List>
          <li>
            <strong className="text-text-primary">Completed orders:</strong> the
            documents are deleted as soon as the print partner marks the order
            complete.
          </li>
          <li>
            <strong className="text-text-primary">Unpaid orders:</strong> an
            order not paid for within {FACTS.unpaidOrderExpiryHours} hour is
            expired and its documents deleted.
          </li>
          <li>
            <strong className="text-text-primary">Abandoned orders:</strong> an
            order not completed within {FACTS.acceptedOrderExpiryHours} hours is
            expired and its documents deleted - whether the shop never accepted
            it, or it was printed and never collected.
          </li>
          <li>
            <strong className="text-text-primary">
              Uploads that never became an order:
            </strong>{" "}
            if you pick a file and then close the app without ordering, that
            file is deleted after {FACTS.orphanUploadRetentionHours} hours. The
            delay exists so that someone who is interrupted mid-checkout does
            not lose their file.
          </li>
        </List>
        <P>
          If a deletion fails - for example because the storage provider is
          briefly unreachable - it is retried automatically on an increasing
          interval until it succeeds. A document is therefore deleted on the
          schedule above or shortly after, not left behind silently.
        </P>
        <P>
          Once a document is deleted, we keep the order record itself - the
          shop, options, page count, filename and amounts - because it is the
          record of a transaction. The file is gone; the receipt remains.
        </P>
      </Section>

      <Section id="use" number="5" title="How we use information">
        <List>
          <li>To create and operate your account and keep you signed in.</li>
          <li>To calculate prices, take payment and fulfil orders.</li>
          <li>To show you nearby shops, if you have allowed location access.</li>
          <li>
            To tell you about your own orders - payment confirmed, accepted,
            ready for pickup, completed - in the app and, if you allow it, as
            push notifications.
          </li>
          <li>To answer support requests.</li>
          <li>
            To detect and prevent abuse, such as repeated failed sign-in
            attempts or attempts to guess a pickup OTP.
          </li>
        </List>
        <P>
          We do not sell your personal information, and we do not use it for
          advertising or profiling.
        </P>
      </Section>

      <Section id="third-parties" number="6" title="Third-party services">
        <List>
          <li>
            <strong className="text-text-primary">Razorpay</strong> - processes
            payments. Your payment details are entered on Razorpay's checkout
            and handled by them.
          </li>
          <li>
            <strong className="text-text-primary">Cloudinary</strong> - stores
            uploaded documents, shop photos and verification documents.
          </li>
          <li>
            <strong className="text-text-primary">MongoDB Atlas</strong> - hosts
            the database.
          </li>
          <li>
            <strong className="text-text-primary">Expo Push Service</strong> -
            delivers push notifications to your device, relayed through Apple
            and Google. A notification contains the order status and shop name,
            never your document or your OTP.
          </li>
          <li>
            <strong className="text-text-primary">Google Sign-In</strong> - used
            by print partners who choose to sign in with Google.
          </li>
        </List>
        <P>
          Each of these processes data under its own privacy policy and
          security practices.
        </P>
      </Section>

      <Section id="payments" number="7" title="Payment information">
        <P>
          Paprout does not collect or store your card number, UPI PIN, CVV,
          bank credentials or any other payment instrument details. Those are
          entered into Razorpay's checkout and never reach our servers.
        </P>
        <P>
          What we store against an order is Razorpay's identifiers for it - the
          payment id and order id - plus the amount and whether payment
          succeeded. Those identifiers let us reconcile a payment and look it up
          if you query it. They cannot be used to charge you.
        </P>
        <Note>
          Paprout makes no claim of PCI-DSS certification. Payment card data is
          handled by Razorpay precisely so that it does not pass through our
          systems.
        </Note>
      </Section>

      <Section id="sharing" number="8" title="Who your data is shared with">
        <List>
          <li>
            <strong className="text-text-primary">The print partner you
            chose</strong> receives your order details and your documents, so
            they can print them. They do not receive your email address, your
            password, your location or your other orders.
          </li>
          <li>
            <strong className="text-text-primary">Paprout administrators</strong>{" "}
            can see orders, shops, settlements and support conversations in
            order to run the platform and resolve disputes.
          </li>
          <li>
            <strong className="text-text-primary">Service providers</strong>{" "}
            listed above, for the functions described.
          </li>
          <li>
            <strong className="text-text-primary">Legal disclosure:</strong> we
            may disclose information where required by Indian law or by a valid
            order from a court or authorised government agency.
          </li>
        </List>
      </Section>

      <Section id="security" number="9" title="Security and access control">
        <List>
          <li>Passwords are stored only as bcrypt hashes.</li>
          <li>
            Every request to the API is authenticated with a signed token tied
            to a server-side session, so signing out immediately invalidates
            that session everywhere, including realtime connections.
          </li>
          <li>
            A document can only be opened by the customer who uploaded it and
            the print partner fulfilling that order. Every request is checked
            against the order.
          </li>
          <li>
            The API sends standard security headers, restricts which web origins
            may call it, and rate-limits sign-in attempts, uploads, orders and
            pickup-OTP attempts.
          </li>
          <li>Traffic to the API is served over HTTPS in production.</li>
        </List>
        <Note>
          No system is perfectly secure, and we do not claim certification under
          any security standard. We describe the controls that exist rather than
          asserting a level of assurance we have not been audited for.
        </Note>
      </Section>

      <Section id="retention-other" number="10" title="Retention of other data">
        <List>
          <li>
            <strong className="text-text-primary">Account details</strong> are
            kept while your account exists.
          </li>
          <li>
            <strong className="text-text-primary">Order records</strong> are kept
            after the documents are deleted, as the record of a transaction and
            because payment and tax records may need to be retained.
          </li>
          <li>
            <strong className="text-text-primary">Sessions</strong> are deleted
            automatically when they expire.
          </li>
          <li>
            <strong className="text-text-primary">
              Payment webhook records
            </strong>{" "}
            are kept for 90 days for reconciliation, then deleted
            automatically.
          </li>
          <li>
            <strong className="text-text-primary">Support conversations</strong>{" "}
            are kept so history is available to you and to support.
          </li>
        </List>
      </Section>

      <Section id="rights" number="11" title="Your rights">
        <P>
          You can view and update your account details in the app, see your
          order history, and turn notifications off at any time from your
          device's settings. To request a copy of the personal information we
          hold about you, or to ask us to correct it, contact{" "}
          {SUPPORT_EMAIL}.
        </P>
      </Section>

      <Section id="deletion" number="12" title="Account and data deletion">
        <P>
          Paprout does not currently have a self-service "delete my account"
          control in the app or the dashboard. Deletion is handled manually on
          request. The Account &amp; Data Deletion page explains how to ask, what
          is deleted, and what has to be kept.
        </P>
      </Section>

      <Section id="children" number="13" title="Children">
        <P>
          Paprout is not directed at children. Accounts should be created by
          people able to enter into a contract under Indian law.
        </P>
      </Section>

      <Section id="changes" number="14" title="Changes to this policy">
        <P>
          We may update this policy as the product changes. The date at the top
          shows when it was last revised. Where a change materially affects how
          your documents are handled, we will say so in the app.
        </P>
      </Section>

      <Section id="contact" number="15" title="Contact and grievances">
        <P>
          Privacy questions can be sent to {SUPPORT_EMAIL}. Formal grievances
          should go to {GRIEVANCE_EMAIL} - see the Grievance &amp; Legal Contact
          page for what to include.
        </P>
      </Section>
    </LegalPage>
  );
}
