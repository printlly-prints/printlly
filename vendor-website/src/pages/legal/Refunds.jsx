import LegalPage, { Section, P, List, Note, Sub } from "../../components/legal/LegalPage";
import { SUPPORT_EMAIL, FACTS } from "../../config/legal";

const TOC = [
  { id: "summary", title: "Summary" },
  { id: "before-payment", title: "Before payment" },
  { id: "failed", title: "Failed or incomplete payments" },
  { id: "after-payment", title: "Cancelling after payment" },
  { id: "declined", title: "If the shop declines" },
  { id: "expired", title: "If the order expires" },
  { id: "duplicate", title: "Duplicate or mismatched payments" },
  { id: "quality", title: "Quality problems" },
  { id: "eligibility", title: "Refund eligibility" },
  { id: "process", title: "How a refund is processed" },
  { id: "timeline", title: "Timelines" },
  { id: "non-refundable", title: "When a refund is not due" },
  { id: "how-to-ask", title: "How to raise a refund request" },
];

export default function Refunds() {
  return (
    <LegalPage
      title="Cancellation & Refund Policy"
      description="When a Printlly order can be cancelled, when a refund is due, and how refunds are handled."
      toc={TOC}
      intro={
        <>
          <P>
            This policy explains when an order can be cancelled and when money
            is returned. It is written to match how Printlly actually works
            today, including where the product does not yet do something
            automatically.
          </P>
        </>
      }
    >
      <Section id="summary" number="1" title="Summary">
        <Note>
          Printlly does not process refunds automatically. There is no
          self-service cancel-and-refund button, and the platform does not
          trigger refunds through Razorpay on its own. Every refund is reviewed
          and arranged by our support team on request. Please read the sections
          below before raising a request.
        </Note>
      </Section>

      <Section id="before-payment" number="2" title="Before payment">
        <P>
          Nothing has been charged until you complete payment, so there is
          nothing to refund. An order you created but did not pay for simply
          expires after {FACTS.unpaidOrderExpiryHours} hour, and its uploaded
          documents are deleted. You do not need to do anything, and you are
          not charged.
        </P>
        <P>
          You can abandon checkout at any point before paying with no cost and
          no cancellation request.
        </P>
      </Section>

      <Section id="failed" number="3" title="Failed or incomplete payments">
        <Sub title="The payment did not go through">
          <P>
            If Razorpay reports the payment as failed, no money is captured and
            the order stays unpaid. You can try paying again for the same
            order. If your bank shows a deduction for a failed attempt, it is an
            authorisation that was never captured and is released back by your
            bank or by Razorpay without us doing anything.
          </P>
        </Sub>
        <Sub title="Payment verification failed">
          <P>
            If a payment response cannot be verified by our server, the order is
            not marked paid. An amount that was authorised but not captured is
            reversed automatically by Razorpay. If an amount was actually
            captured in this situation, contact support with your payment
            reference - this is a case we handle manually.
          </P>
        </Sub>
        <Sub title="Payment succeeded but the order did not update">
          <P>
            Razorpay also confirms payments to our server directly, separately
            from your app. That is specifically so a payment is still recorded
            if your app closed, lost signal or crashed at the moment of paying.
            In most cases the order corrects itself within moments.
          </P>
          <P>
            If an order is still showing as unpaid some time after money left
            your account, contact support with the payment reference. Do not pay
            again.
          </P>
        </Sub>
      </Section>

      <Section id="after-payment" number="4" title="Cancelling after payment">
        <P>
          Printlly does not currently provide a customer-facing cancel button
          for a paid order. If you need an order stopped - you ordered the wrong
          file, chose the wrong shop, or no longer need it - contact support as
          soon as possible.
        </P>
        <P>
          Whether a refund is possible depends mainly on whether the shop has
          already printed the work:
        </P>
        <List>
          <li>
            <strong className="text-text-primary">Not yet accepted</strong> - no
            printing has started. A refund is normally appropriate.
          </li>
          <li>
            <strong className="text-text-primary">Accepted but not yet
            printed</strong> - we will ask the shop. A refund may be possible.
          </li>
          <li>
            <strong className="text-text-primary">Already printed / ready for
            pickup</strong> - the shop has used paper, ink and time on your job.
            A refund is unlikely, though we will still look at the specific
            situation.
          </li>
        </List>
      </Section>

      <Section id="declined" number="5" title="If the shop declines your order">
        <P>
          A print partner can decline a paid order - for example if their
          machine is down or they cannot do the job as specified. Nothing has
          been printed, so a refund of the full amount is appropriate. Contact
          support, or we will reach out if we see it.
        </P>
      </Section>

      <Section id="expired" number="6" title="If the order expires">
        <P>
          An order that is not completed within{" "}
          {FACTS.acceptedOrderExpiryHours} hours is marked expired and its
          documents are deleted. Two different situations end up here:
        </P>
        <List>
          <li>
            <strong className="text-text-primary">The shop never accepted
            it.</strong> No work was done. A refund is appropriate - contact
            support.
          </li>
          <li>
            <strong className="text-text-primary">It was printed but you did
            not collect it.</strong> The shop has done the work and absorbed the
            cost of materials. A refund is not normally due in this case.
          </li>
        </List>
        <P>
          Expiry does not itself trigger a refund. If you believe one is due,
          raise it with support.
        </P>
      </Section>

      <Section id="duplicate" number="7" title="Duplicate or mismatched payments">
        <P>
          If you were charged twice for one order, contact support with both
          payment references. A duplicate charge is refundable in full.
        </P>
        <P>
          If the amount captured does not match the order total, our system
          deliberately refuses to mark that order paid and records the
          discrepancy for review rather than accepting the mismatch. If this
          happens to you, your order will appear unpaid even though money was
          taken. Contact support - this needs a person to resolve.
        </P>
      </Section>

      <Section id="quality" number="8" title="Quality problems">
        <P>
          Printing is carried out by the independent print partner, not by
          Printlly. If a print is wrong - missing pages, wrong colour setting,
          poor quality - raise it with the shop at the counter first. They are
          usually able to reprint on the spot, which is faster and better than a
          refund.
        </P>
        <P>
          If the shop will not help, contact Printlly support. We can see the
          order, the options you selected and the amounts charged, and we will
          try to reach a fair outcome. We cannot compel an independent business
          to reprint or refund.
        </P>
      </Section>

      <Section id="eligibility" number="9" title="Refund eligibility">
        <P>A refund is normally appropriate where:</P>
        <List>
          <li>you were charged more than once for the same order;</li>
          <li>you were charged but the order was never accepted by the shop;</li>
          <li>the shop declined the order after payment;</li>
          <li>
            money was captured but the order could not be marked paid because of
            a fault on our side.
          </li>
        </List>
      </Section>

      <Section id="process" number="10" title="How a refund is processed">
        <P>
          When a refund is agreed, it is arranged through Razorpay against the
          original payment and returns to the same payment method you used. We
          cannot refund to a different card, account or UPI ID.
        </P>
        <Note>
          To be explicit: this step is carried out manually by our team. The
          platform does not currently issue refunds by itself, and nothing on
          Printlly will automatically return money to you without a support
          request being raised and reviewed.
        </Note>
      </Section>

      <Section id="timeline" number="11" title="Timelines">
        <P>
          Once a refund has been initiated with Razorpay, how long it takes to
          appear is determined by Razorpay and by your bank or card issuer, not
          by Printlly. It is commonly several working days.
        </P>
        <P>
          We are deliberately not publishing a guaranteed turnaround for
          acknowledging or deciding a refund request, because no such service
          commitment has been established yet. We will respond as quickly as we
          can and tell you the outcome.
        </P>
      </Section>

      <Section id="non-refundable" number="12" title="When a refund is not due">
        <List>
          <li>
            The order was printed and made ready, and you did not collect it.
          </li>
          <li>
            You uploaded the wrong document and it has already been printed.
          </li>
          <li>
            You are dissatisfied with content you supplied yourself, rather than
            with the printing.
          </li>
          <li>
            A payment that was never captured - there is nothing to return.
          </li>
        </List>
      </Section>

      <Section id="how-to-ask" number="13" title="How to raise a refund request">
        <P>
          Customers can message us from the Help &amp; Support screen in the
          Printlly app, which reaches our support team directly. You can also
          email {SUPPORT_EMAIL}.
        </P>
        <P>Please include:</P>
        <List>
          <li>the order's date and the shop you ordered from;</li>
          <li>the amount charged;</li>
          <li>
            the Razorpay payment reference, if you have it from your bank or
            email;
          </li>
          <li>what went wrong.</li>
        </List>
      </Section>
    </LegalPage>
  );
}
