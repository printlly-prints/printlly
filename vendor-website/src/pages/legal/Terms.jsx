import LegalPage, { Section, P, List, Note, Sub } from "../../components/legal/LegalPage";
import {
  LEGAL_BUSINESS_NAME,
  SUPPORT_EMAIL,
  GOVERNING_STATE,
  FACTS,
} from "../../config/legal";

const TOC = [
  { id: "introduction", title: "Introduction and acceptance" },
  { id: "eligibility", title: "Eligibility and accounts" },
  { id: "role", title: "Our role as an intermediary" },
  { id: "documents", title: "Documents you upload" },
  { id: "prohibited", title: "Prohibited content and use" },
  { id: "ip", title: "Intellectual property and copyright" },
  { id: "orders", title: "Placing an order" },
  { id: "pricing", title: "Pricing, fees and taxes" },
  { id: "payment", title: "Payment" },
  { id: "fulfilment", title: "Acceptance, printing and pickup" },
  { id: "expiry", title: "Expiry and cancellation" },
  { id: "refunds", title: "Refunds" },
  { id: "vendors", title: "Print partner responsibilities" },
  { id: "disputes", title: "Disputes" },
  { id: "availability", title: "Service availability" },
  { id: "suspension", title: "Suspension and termination" },
  { id: "data", title: "Data and document handling" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnification" },
  { id: "changes", title: "Changes to these terms" },
  { id: "law", title: "Governing law and jurisdiction" },
  { id: "contact", title: "Contact" },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms & Conditions"
      description="The terms that govern use of Printlly by customers and print partners."
      toc={TOC}
      intro={
        <>
          <P>
            These terms govern your use of Printlly, a platform that connects
            customers who need documents printed with independent print shops
            ("print partners") who print them. Printlly is operated by{" "}
            {LEGAL_BUSINESS_NAME}.
          </P>
          <P>
            Please read them alongside our Privacy Policy, Cancellation &amp;
            Refund Policy and Shipping / Delivery Policy, which form part of
            these terms.
          </P>
        </>
      }
    >
      <Section id="introduction" number="1" title="Introduction and acceptance">
        <P>
          By creating an account, placing an order, or registering a shop on
          Printlly, you agree to these terms. If you do not agree with them,
          please do not use the service.
        </P>
      </Section>

      <Section id="eligibility" number="2" title="Eligibility and accounts">
        <List>
          <li>
            You must be legally capable of entering into a contract under Indian
            law to use Printlly.
          </li>
          <li>
            Customers register with a name, phone number, email address and
            password. Print partners may instead sign in with Google.
          </li>
          <li>
            You are responsible for keeping your password and your device
            secure, and for activity that takes place under your account.
          </li>
          <li>
            You must provide accurate information. One email address and one
            phone number may each be registered to only one account.
          </li>
        </List>
      </Section>

      <Section id="role" number="3" title="Our role as an intermediary">
        <P>
          Printlly is a marketplace. The printing itself is carried out by
          independent print shops who set their own prices, decide which orders
          to accept, and are responsible for the quality and timeliness of the
          work they do.
        </P>
        <P>
          Printlly is not the printer, and does not warrant the output of any
          print partner. What Printlly provides is the platform: shop discovery,
          document handling, server-side pricing calculation, payment
          collection, order tracking and pickup verification.
        </P>
      </Section>

      <Section id="documents" number="4" title="Documents you upload">
        <List>
          <li>
            You may upload up to {FACTS.maxFilesPerUpload} PDF documents per
            order, each up to {FACTS.maxFileSizeMb} MB.
          </li>
          <li>
            Printlly reads each document on the server to count its pages. That
            page count, not a number you supply, is what the order is priced
            on.
          </li>
          <li>
            A document attached to an order is made available to the print
            partner you selected, so that they can print it. No other shop can
            see it.
          </li>
          <li>
            Documents are deleted after the order is completed, and are also
            deleted when an order expires. See the Privacy Policy for exactly
            when and how.
          </li>
        </List>
      </Section>

      <Section id="prohibited" number="5" title="Prohibited content and use">
        <P>You must not upload, print or attempt to print:</P>
        <List>
          <li>
            material you do not have the legal right to copy, reproduce or
            distribute;
          </li>
          <li>
            counterfeit documents, forged identity or government documents, fake
            currency, or anything intended to deceive;
          </li>
          <li>
            content that is unlawful under Indian law, including material that
            infringes copyright, is obscene, or incites violence or hatred;
          </li>
          <li>
            another person's private or personal documents without their
            permission.
          </li>
        </List>
        <P>
          You must also not attempt to interfere with the platform, access
          another user's account or orders, or use automated means to place
          orders or scrape shop information.
        </P>
      </Section>

      <Section id="ip" number="6" title="Intellectual property and copyright">
        <P>
          You keep all rights in the documents you upload. Printlly claims no
          ownership of them and uses them only to fulfil your order.
        </P>
        <P>
          <strong className="text-text-primary">
            You are responsible for having the legal right to print what you
            upload.
          </strong>{" "}
          Printlly does not review, verify or moderate the contents of customer
          documents, and is not responsible for them. If you upload material you
          are not entitled to reproduce, that is your responsibility and not
          ours or the print partner's.
        </P>
        <P>
          The Printlly name, logo, platform and software remain our property and
          may not be copied or reused without permission.
        </P>
      </Section>

      <Section id="orders" number="7" title="Placing an order">
        <P>An order is created in this sequence:</P>
        <List ordered>
          <li>You upload one or more PDF documents.</li>
          <li>
            You choose a print partner and, for each document, the print options
            that shop offers - black &amp; white or colour, paper size, single
            or double sided, number of copies, and any add-on services the shop
            has listed.
          </li>
          <li>
            Printlly calculates the price on the server from the shop's own
            rates and the page count it measured.
          </li>
          <li>You pay. Only then does the order reach the print partner.</li>
        </List>
        <Note>
          An order that has been created but not paid for is not visible to the
          print partner and is not being worked on.
        </Note>
      </Section>

      <Section id="pricing" number="8" title="Pricing, fees and taxes">
        <List>
          <li>
            Each print partner sets their own rates. Prices differ between
            shops, which is why the total is shown before you pay.
          </li>
          <li>
            Printlly adds a platform fee to each order. The fee is shown as a
            separate line in the order total before payment.
          </li>
          <li>
            The price shown at checkout is the price charged. It is calculated
            and frozen on the server when the order is created, so a later
            change to a shop's rates or to the platform fee does not change what
            you were quoted.
          </li>
        </List>
        <Sub title="Taxes">
          <P>
            Any taxes that apply are included in the amounts displayed. Printlly
            does not currently issue GST invoices through the platform - see the
            Payment &amp; Billing page for what is and is not provided.
          </P>
        </Sub>
      </Section>

      <Section id="payment" number="9" title="Payment">
        <P>
          Payments are processed by Razorpay. Printlly does not receive or store
          your card, UPI or bank credentials; those are handled by Razorpay on
          their own systems.
        </P>
        <P>
          An order is treated as paid only when payment is confirmed to our
          server - either by the verified response returned at the end of
          checkout, or by Razorpay's server-to-server confirmation. A client
          claiming a payment succeeded is never sufficient on its own.
        </P>
        <P>
          When payment is confirmed, Printlly generates a {FACTS.otpDigits}
          -digit pickup OTP for the order and the order becomes visible to the
          print partner.
        </P>
      </Section>

      <Section id="fulfilment" number="10" title="Acceptance, printing and pickup">
        <List>
          <li>
            A paid order appears in the print partner's queue. The shop may
            accept it or decline it.
          </li>
          <li>
            Once accepted, the shop prints the documents and marks the order
            ready for pickup. You are notified when this happens.
          </li>
          <li>
            You collect the order in person from the shop and give them your
            pickup OTP. The shop can only mark the order complete by entering
            the correct OTP.
          </li>
          <li>
            Anyone who has your OTP can collect your order. Treat it as you
            would a one-time password.
          </li>
        </List>
        <Note>
          Printlly does not offer home delivery. All orders are collected from
          the shop you selected.
        </Note>
      </Section>

      <Section id="expiry" number="11" title="Expiry and cancellation">
        <List>
          <li>
            An order that is created but not paid for within{" "}
            {FACTS.unpaidOrderExpiryHours} hour is marked expired, and its
            uploaded documents are deleted.
          </li>
          <li>
            An order that is paid for but not completed within{" "}
            {FACTS.acceptedOrderExpiryHours} hours is marked expired, and its
            documents are deleted. This covers an order a shop never accepted,
            and one that was printed but never collected.
          </li>
          <li>
            A print partner may decline an order. You will see the order move to
            a cancelled state.
          </li>
        </List>
        <P>
          Printlly does not currently provide a way for a customer to cancel an
          order themselves after paying. If you need an order stopped, contact
          support - see the Cancellation &amp; Refund Policy.
        </P>
      </Section>

      <Section id="refunds" number="12" title="Refunds">
        <P>
          Refund eligibility and how refunds are handled are set out in full in
          the Cancellation &amp; Refund Policy. In summary: refunds are not
          processed automatically by the platform, and are handled case by case
          through support.
        </P>
      </Section>

      <Section id="vendors" number="13" title="Print partner responsibilities">
        <P>
          Print partners agree to separate terms covering pricing accuracy,
          handling of customer documents, pickup verification and settlement.
          See the Print Partner Terms.
        </P>
      </Section>

      <Section id="disputes" number="14" title="Disputes">
        <P>
          If an order is not printed as ordered, is of poor quality, or is not
          made available for pickup, raise it with the print partner first -
          they did the work and are usually able to fix it fastest.
        </P>
        <P>
          If that does not resolve it, contact Printlly support. We can see the
          order record, its status history and the amounts charged, and we will
          try to help both sides reach a fair outcome. We cannot compel a print
          partner to reprint or compensate, as they are independent businesses.
        </P>
      </Section>

      <Section id="availability" number="15" title="Service availability">
        <P>
          Shops set their own availability and may be open, busy or closed at
          any time. A shop marked busy is still accepting orders but has told us
          preparation will take longer. A closed shop cannot be ordered from.
        </P>
        <P>
          Printlly is provided on an "as available" basis. We do not guarantee
          uninterrupted service, and the platform may be unavailable for
          maintenance or due to failures in services we depend on.
        </P>
      </Section>

      <Section id="suspension" number="16" title="Suspension and termination">
        <P>
          We may suspend or close an account that breaches these terms, uses the
          platform unlawfully, or abuses other users or print partners. A print
          partner's shop may be deactivated, which removes it from search while
          leaving its existing orders intact.
        </P>
      </Section>

      <Section id="data" number="17" title="Data and document handling">
        <P>
          How we handle your personal information and your uploaded documents -
          including who can see them and when they are deleted - is described in
          the Privacy Policy. It is written to match what the system actually
          does, and we would rather it be accurate than reassuring.
        </P>
      </Section>

      <Section id="liability" number="18" title="Limitation of liability">
        <P>
          To the extent permitted by law, Printlly is not liable for the quality
          or timeliness of printing carried out by a print partner, for the
          contents of documents you upload, or for loss arising from a shop
          being closed, busy or declining an order.
        </P>
        <P>
          Nothing in these terms excludes liability that cannot be excluded
          under Indian law, including liability for fraud.
        </P>
      </Section>

      <Section id="indemnity" number="19" title="Indemnification">
        <P>
          You agree to indemnify Printlly against claims, losses and reasonable
          costs arising from your breach of these terms, or from documents you
          uploaded that you did not have the right to print.
        </P>
      </Section>

      <Section id="changes" number="20" title="Changes to these terms">
        <P>
          We may update these terms. The date at the top of this page shows when
          they were last changed. Continuing to use Printlly after a change
          means you accept the updated terms.
        </P>
      </Section>

      <Section id="law" number="21" title="Governing law and jurisdiction">
        <P>
          These terms are governed by the laws of India. Courts at{" "}
          {GOVERNING_STATE} have exclusive jurisdiction over disputes arising
          from them.
        </P>
      </Section>

      <Section id="contact" number="22" title="Contact">
        <P>
          Questions about these terms can be sent to {SUPPORT_EMAIL}. For formal
          complaints, see the Grievance &amp; Legal Contact page.
        </P>
      </Section>
    </LegalPage>
  );
}
