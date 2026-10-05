import LegalPage, { Section, P, List, Note } from "../../components/legal/LegalPage";
import { SUPPORT_EMAIL, FACTS } from "../../config/legal";

const TOC = [
  { id: "model", title: "How fulfilment works" },
  { id: "no-delivery", title: "Home delivery" },
  { id: "steps", title: "Step by step" },
  { id: "timing", title: "Preparation time" },
  { id: "otp", title: "Pickup verification" },
  { id: "someone-else", title: "Someone else collecting" },
  { id: "closed", title: "Shop closed, busy or unavailable" },
  { id: "delays", title: "Delays" },
  { id: "uncollected", title: "Uncollected orders" },
  { id: "problems", title: "If something goes wrong" },
];

export default function Delivery() {
  return (
    <LegalPage
      title="Shipping & Delivery Policy"
      description="Printlly orders are collected in person from the print shop you choose. How pickup works."
      toc={TOC}
      intro={
        <P>
          Printlly is a print-and-collect service, not a shipping service. This
          page explains how an order reaches you.
        </P>
      }
    >
      <Section id="model" number="1" title="How fulfilment works">
        <P>
          You choose a participating print shop, pay online, and collect your
          printed documents from that shop in person. Nothing is posted,
          couriered or dispatched.
        </P>
      </Section>

      <Section id="no-delivery" number="2" title="Home delivery">
        <Note>
          Printlly does not currently offer home delivery. There is no delivery
          option at checkout, no delivery address is collected, and no delivery
          charge exists. Every order is collected from the shop you selected.
        </Note>
        <P>
          You may see home delivery shown in the app as an option that cannot be
          selected. It is displayed to indicate a direction the product may take
          and is deliberately not selectable, because it is not available.
        </P>
      </Section>

      <Section id="steps" number="3" title="Step by step">
        <List ordered>
          <li>You upload your documents and choose your print options.</li>
          <li>
            You select a shop. The app shows each shop's distance from you if
            you have allowed location access, and whether it is open, busy or
            closed.
          </li>
          <li>You pay. The order then appears in that shop's queue.</li>
          <li>The shop accepts the order and prints it.</li>
          <li>
            The shop marks the order ready for pickup. You are notified in the
            app, and by push notification if you have allowed them.
          </li>
          <li>
            You go to the shop and give them your {FACTS.otpDigits}-digit pickup
            OTP.
          </li>
          <li>
            The shop enters the OTP, hands over your prints, and the order is
            complete.
          </li>
        </List>
      </Section>

      <Section id="timing" number="4" title="Preparation time">
        <P>
          Preparation time is set by each shop and depends on their current
          queue. Printlly does not set, guarantee or enforce a turnaround time.
        </P>
        <P>
          A shop can mark itself busy when it has a high volume of work. When it
          does, the app shows that the shop is busy together with the longer
          preparation estimate the shop itself has chosen. A busy shop is still
          open and still accepting orders.
        </P>
        <P>
          The only timing Printlly enforces is expiry: an order that has not
          been completed within {FACTS.acceptedOrderExpiryHours} hours is marked
          expired.
        </P>
      </Section>

      <Section id="otp" number="5" title="Pickup verification">
        <P>
          A {FACTS.otpDigits}-digit OTP is generated for your order once payment
          is confirmed, and is visible to you in the app. It is the only way an
          order can be marked collected - the shop cannot complete an order
          without entering it correctly.
        </P>
        <P>
          This exists so your printed documents are handed to you and not to
          someone else who happens to mention your name. Repeated incorrect OTP
          attempts on an order are rate-limited.
        </P>
      </Section>

      <Section id="someone-else" number="6" title="Someone else collecting">
        <P>
          Printlly has no separate feature for nominating another person to
          collect. In practice, anyone who has your OTP can collect your order.
          If you share it with someone, you are authorising them to collect on
          your behalf, and you are responsible for that choice. Treat the OTP as
          you would any one-time password.
        </P>
      </Section>

      <Section id="closed" number="7" title="Shop closed, busy or unavailable">
        <List>
          <li>
            A shop marked <strong className="text-text-primary">closed</strong>{" "}
            cannot be ordered from.
          </li>
          <li>
            A shop marked <strong className="text-text-primary">busy</strong> is
            trading normally and accepting orders, with a longer preparation
            estimate.
          </li>
          <li>
            A shop may be deactivated by its owner or by Printlly, which removes
            it from search. Orders already placed with it are unaffected.
          </li>
        </List>
        <P>
          Shops set their own opening hours. If you arrive and the shop is
          closed, your order remains ready for pickup and you can collect it
          when they reopen - as long as it has not expired.
        </P>
      </Section>

      <Section id="delays" number="8" title="Delays">
        <P>
          Because printing is carried out by independent shops, delays can
          happen - equipment faults, paper shortages, an unexpected queue.
          Printlly shows you the order's current status but does not control the
          shop's workload and does not guarantee a completion time.
        </P>
      </Section>

      <Section id="uncollected" number="9" title="Uncollected orders">
        <P>
          If an order is not collected within {FACTS.acceptedOrderExpiryHours}{" "}
          hours of being placed, it is marked expired and the uploaded documents
          are deleted from our storage.
        </P>
        <P>
          Expiry does not by itself entitle you to a refund. Where the shop had
          already printed the work, the materials and time have been used. See
          the Cancellation &amp; Refund Policy.
        </P>
        <P>
          What a shop does with uncollected printouts is a matter for that shop.
          Printlly does not hold or store physical printouts at any point.
        </P>
      </Section>

      <Section id="problems" number="10" title="If something goes wrong">
        <P>
          Speak to the shop first - they have your job in front of them and can
          usually fix it immediately. If that does not resolve it, contact
          Printlly support from the Help &amp; Support screen in the app, or at{" "}
          {SUPPORT_EMAIL}.
        </P>
      </Section>
    </LegalPage>
  );
}
