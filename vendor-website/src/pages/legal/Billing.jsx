import LegalPage, { Section, P, List, Note, Sub } from "../../components/legal/LegalPage";
import { SUPPORT_EMAIL, GSTIN, FACTS } from "../../config/legal";

const TOC = [
  { id: "methods", title: "Accepted payment methods" },
  { id: "when", title: "When you are charged" },
  { id: "makeup", title: "What makes up the total" },
  { id: "confirmation", title: "How a payment is confirmed" },
  { id: "failure", title: "Failed payments" },
  { id: "receipts", title: "Receipts and invoices" },
  { id: "gst", title: "GST and taxes" },
  { id: "refunds", title: "Refunds" },
  { id: "disputes", title: "Payment disputes and chargebacks" },
  { id: "security", title: "Payment security" },
];

export default function Billing() {
  return (
    <LegalPage
      title="Payment & Billing"
      description="How Printlly charges for print orders, what makes up the total, and how payments are confirmed."
      toc={TOC}
      intro={
        <P>
          Payments on Printlly are processed by Razorpay. This page explains
          what you are charged, when, and what documentation you do and do not
          receive.
        </P>
      }
    >
      <Section id="methods" number="1" title="Accepted payment methods">
        <P>
          Payment is taken through Razorpay's checkout, which supports UPI,
          credit and debit cards, net banking and wallets. The exact set of
          options shown to you is determined by Razorpay and by your bank, not
          by Printlly.
        </P>
        <P>All amounts are in Indian rupees (INR).</P>
        <Note>
          There is no cash-on-pickup option. An order must be paid online before
          it reaches the print shop.
        </Note>
      </Section>

      <Section id="when" number="2" title="When you are charged">
        <P>
          You are charged once, when you complete payment at checkout. The
          amount is the order total shown to you before you pay.
        </P>
        <P>
          Creating an order does not charge you. An order that is created but
          never paid for simply expires after {FACTS.unpaidOrderExpiryHours}{" "}
          hour.
        </P>
      </Section>

      <Section id="makeup" number="3" title="What makes up the total">
        <List>
          <li>
            <strong className="text-text-primary">The printing charge</strong>,
            calculated from the shop's own rates and the page count our server
            measured from your documents. This covers the print type, paper
            size, sides, copies and any add-on services you selected.
          </li>
          <li>
            <strong className="text-text-primary">The Printlly platform
            fee</strong>, shown as its own line in the total.
          </li>
        </List>
        <P>
          The total is calculated on the server and frozen onto the order when
          it is created. A later change to the shop's rates or to the platform
          fee does not change what you were quoted or charged.
        </P>
      </Section>

      <Section id="confirmation" number="4" title="How a payment is confirmed">
        <P>
          An order is marked paid only when our own server has verified the
          payment. There are two independent paths, and either is sufficient:
        </P>
        <List ordered>
          <li>
            The signed response returned by Razorpay at the end of checkout,
            which our server re-verifies cryptographically rather than trusting
            the app's word for it.
          </li>
          <li>
            Razorpay's server-to-server confirmation, sent directly to us.
          </li>
        </List>
        <P>
          The second path exists so your payment is still recorded if your app
          crashes, loses signal, or you close it on the success screen. Whichever
          arrives first confirms the order; the other is recognised as a
          duplicate and changes nothing.
        </P>
        <P>
          When payment is confirmed, your pickup OTP is generated and the order
          becomes visible to the shop.
        </P>
      </Section>

      <Section id="failure" number="5" title="Failed payments">
        <P>
          If a payment fails, the order stays unpaid and you can try again for
          the same order. An amount your bank shows as deducted for a failed
          attempt is normally an authorisation that was never captured, and is
          released without any action from us.
        </P>
        <P>
          If the amount Razorpay reports does not match the order total, our
          system refuses to mark the order paid and records the discrepancy for
          review rather than accepting it. If that happens, contact support -
          it needs a person to resolve.
        </P>
      </Section>

      <Section id="receipts" number="6" title="Receipts and invoices">
        <Note>
          Printlly does not currently generate invoices, receipts or billing
          documents through the platform. There is no download-invoice feature,
          and none is emailed to you.
        </Note>
        <P>What you do have as a record of payment:</P>
        <List>
          <li>
            The order in the Printlly app, showing the shop, the itemised
            charges, the platform fee and the total.
          </li>
          <li>
            Razorpay's own payment confirmation, and your bank or card
            statement.
          </li>
        </List>
        <P>
          If you need something for an expense claim, contact {SUPPORT_EMAIL}{" "}
          with the order details.
        </P>
      </Section>

      <Section id="gst" number="7" title="GST and taxes">
        <P>
          Any taxes that apply are included within the amounts displayed. No
          tax is added on top at checkout.
        </P>
        <Note>
          Printlly does not currently issue GST invoices, and the platform's
          GSTIN has not been configured in this deployment (shown as {GSTIN}).
          No GSTIN has been invented to fill the gap. If you require a GST
          invoice, please contact us before relying on being able to claim
          input credit for an order.
        </Note>
        <Sub title="A note for print partners">
          <P>
            A shop may optionally record its own GST number during verification.
            That is the shop's registration, used as part of verifying the
            business, and is separate from any platform-level tax
            documentation.
          </P>
        </Sub>
      </Section>

      <Section id="refunds" number="8" title="Refunds">
        <P>
          Refunds are not processed automatically by the platform. Each one is
          reviewed and arranged by our support team, then issued through
          Razorpay back to the original payment method. The Cancellation &amp;
          Refund Policy sets out when a refund is appropriate and how to ask.
        </P>
      </Section>

      <Section id="disputes" number="9" title="Payment disputes and chargebacks">
        <P>
          If you believe you have been charged incorrectly, please contact us
          before raising a dispute with your bank. We can see the order, the
          amount and the payment reference, and a direct correction is usually
          faster than a chargeback.
        </P>
        <P>
          Include the order date, the shop, the amount, and the Razorpay payment
          reference if you have it.
        </P>
      </Section>

      <Section id="security" number="10" title="Payment security">
        <P>
          Printlly does not receive or store your card number, CVV, UPI PIN or
          bank credentials. Those are entered into Razorpay's checkout and
          handled on their systems.
        </P>
        <P>
          What we store against an order is Razorpay's payment and order
          identifiers plus the amount, which let us reconcile and look up a
          payment. They cannot be used to charge you.
        </P>
        <Note>
          Printlly makes no claim to PCI-DSS certification. Card data is handled
          by Razorpay precisely so that it never passes through our systems.
        </Note>
      </Section>
    </LegalPage>
  );
}
