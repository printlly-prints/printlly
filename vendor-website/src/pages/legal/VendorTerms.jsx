import LegalPage, { Section, P, List, Note } from "../../components/legal/LegalPage";
import { SUPPORT_EMAIL, FACTS } from "../../config/legal";

const TOC = [
  { id: "who", title: "Who these terms apply to" },
  { id: "eligibility", title: "Eligibility and verification" },
  { id: "shop-info", title: "Shop information" },
  { id: "pricing", title: "Pricing accuracy" },
  { id: "availability", title: "Availability" },
  { id: "orders", title: "Accepting and declining orders" },
  { id: "quality", title: "Printing and quality" },
  { id: "documents", title: "Customer documents" },
  { id: "pickup", title: "Pickup verification" },
  { id: "conduct", title: "Customer interaction" },
  { id: "settlement", title: "Settlement and platform fees" },
  { id: "payout", title: "Payout details" },
  { id: "compliance", title: "Legal compliance" },
  { id: "suspension", title: "Suspension and deactivation" },
  { id: "disputes", title: "Disputes" },
  { id: "changes", title: "Changes" },
];

export default function VendorTerms() {
  return (
    <LegalPage
      title="Print Partner Terms"
      description="Terms for print shops fulfilling orders on Paprout: verification, pricing, documents, pickup and settlement."
      toc={TOC}
      intro={
        <>
          <P>
            These terms apply to print shops ("print partners") who register on
            Paprout and fulfil customer orders. They are in addition to the
            general Terms &amp; Conditions.
          </P>
          <P>
            The section on customer documents is the one that matters most.
            Customers send personal paperwork through this platform on the
            understanding that it goes to one shop, for one job, and no
            further.
          </P>
        </>
      }
    >
      <Section id="who" number="1" title="Who these terms apply to">
        <P>
          Anyone who registers a shop on Paprout. You operate as an independent
          business, not as an employee, agent or franchisee of Paprout. You
          decide your own prices, your own hours, and which orders you take.
        </P>
      </Section>

      <Section id="eligibility" number="2" title="Eligibility and verification">
        <List>
          <li>
            You must be operating a genuine printing business and be entitled to
            do so.
          </li>
          <li>
            You must submit an identity document for verification. A GST number
            may be provided and is optional - a shop below the registration
            threshold is not required to have one.
          </li>
          <li>
            Your shop is reviewed by a Paprout administrator and becomes
            visible to customers only once approved. An application may be
            rejected, with a reason, and you may resubmit.
          </li>
          <li>
            Verification confirms the documents you submitted. It is not an
            inspection of your premises, equipment or output quality, and
            Paprout makes no warranty to customers about either.
          </li>
        </List>
      </Section>

      <Section id="shop-info" number="3" title="Shop information">
        <P>
          Your shop name, address, contact number, location and photos must be
          accurate and must relate to the shop actually fulfilling orders.
          Customers choose a shop partly on distance, so an incorrect location
          sends people to the wrong place.
        </P>
        <P>Keep this information up to date if anything changes.</P>
      </Section>

      <Section id="pricing" number="4" title="Pricing accuracy">
        <List>
          <li>
            You set your own rates for print type, paper size, double-sided
            printing, and any add-on services you choose to offer.
          </li>
          <li>
            The rates you publish are the rates charged. Paprout calculates
            each order total on the server from your published rates and the
            page count it measured, and freezes that total onto the order.
          </li>
          <li>
            You may not ask a customer for more money at the counter for work
            covered by the order. If a job genuinely cannot be done at the
            quoted price, decline the order rather than renegotiating at
            pickup.
          </li>
          <li>
            A change to your rates applies to future orders only. It never
            changes an order that has already been placed.
          </li>
        </List>
      </Section>

      <Section id="availability" number="5" title="Availability">
        <List>
          <li>
            Keep your status honest. Mark yourself{" "}
            <strong className="text-text-primary">busy</strong> when work is
            taking longer - you keep receiving orders, and customers see your
            longer preparation estimate. Mark yourself{" "}
            <strong className="text-text-primary">closed</strong> when you
            cannot take work at all.
          </li>
          <li>
            You may deactivate your shop, which removes it from customer search.
            Orders already placed remain your responsibility.
          </li>
        </List>
      </Section>

      <Section id="orders" number="6" title="Accepting and declining orders">
        <List>
          <li>Only paid orders reach your queue. You will never be asked to print an unpaid order.</li>
          <li>
            You may decline an order you cannot fulfil. Do so promptly - the
            customer has already paid and is waiting.
          </li>
          <li>
            Declining an order you simply do not want to do, repeatedly, may
            lead to your shop being deactivated.
          </li>
          <li>
            An order not completed within {FACTS.acceptedOrderExpiryHours} hours
            is automatically expired and the customer's documents are deleted.
            After that you cannot complete it.
          </li>
        </List>
      </Section>

      <Section id="quality" number="7" title="Printing and quality">
        <P>
          You are responsible for the printing: that it matches the options the
          customer selected, that it is legible and complete, and that it is
          ready when you say it is.
        </P>
        <P>
          Paprout does not inspect your output. If a customer raises a quality
          problem, we expect you to deal with it fairly - usually by
          reprinting.
        </P>
      </Section>

      <Section id="documents" number="8" title="Customer documents">
        <Note>
          Customer documents are provided to you for one purpose: printing that
          specific order. Nothing else.
        </Note>
        <P>You must not:</P>
        <List>
          <li>
            keep, copy, archive or back up a customer's document after the order
            is finished;
          </li>
          <li>
            read, share, forward, publish or discuss the contents with anyone;
          </li>
          <li>
            use a document for any purpose of your own, including marketing,
            training or research;
          </li>
          <li>
            print extra copies beyond what the order specifies, or retain
            surplus printouts.
          </li>
        </List>
        <P>You must:</P>
        <List>
          <li>
            access documents only through the Paprout dashboard, and only for
            orders assigned to you;
          </li>
          <li>
            keep your dashboard account secure and not share your login;
          </li>
          <li>
            dispose of any misprints or uncollected printouts securely, rather
            than leaving them in open waste.
          </li>
        </List>
        <P>
          Paprout deletes a document from its storage when the order is
          completed or expires. That deletion cannot reach a copy you made,
          which is why these obligations exist. Breaching them is grounds for
          immediate removal from the platform, and may expose you to liability
          to the customer directly.
        </P>
      </Section>

      <Section id="pickup" number="9" title="Pickup verification">
        <List>
          <li>
            Every order is completed by entering the customer's{" "}
            {FACTS.otpDigits}-digit pickup OTP. There is no other way to mark an
            order complete, and this is deliberate.
          </li>
          <li>
            Do not hand over printed documents without the OTP, however
            convincing the person is. The code is what protects the customer's
            paperwork.
          </li>
          <li>
            Do not ask a customer for their OTP before the order is ready, and
            do not record it.
          </li>
          <li>
            Repeated incorrect OTP attempts on an order are rate-limited.
            Attempting to guess a customer's code is a serious breach of these
            terms.
          </li>
        </List>
      </Section>

      <Section id="conduct" number="10" title="Customer interaction">
        <P>
          Deal with customers courteously. Do not use contact details obtained
          through an order to market to them, add them to a list, or contact
          them about anything other than that order.
        </P>
      </Section>

      <Section id="settlement" number="11" title="Settlement and platform fees">
        <P>
          Customers pay Paprout, not you directly. Paprout then settles with
          you for the orders you have completed.
        </P>
        <List>
          <li>
            Your amount for an order is the order total minus the Paprout
            platform fee. It is fixed at the moment the customer's payment is
            confirmed and is never recalculated afterwards - so a later change
            to the platform fee cannot alter what you are owed for work already
            done.
          </li>
          <li>
            An order becomes settleable once it is completed and paid.
          </li>
          <li>
            Your Earnings page shows your unsettled balance, how many orders it
            covers, and your settlement history.
          </li>
          <li>
            Settlements are made by UPI or bank transfer outside the platform
            and then recorded against your account, with a reference where one
            is available. Paprout does not currently make automated payouts.
          </li>
        </List>
        <Note>
          No settlement frequency or payout schedule is published here, because
          none has been established in the product. Settlements are made
          manually. If you need to know when to expect one, ask support.
        </Note>
      </Section>

      <Section id="payout" number="12" title="Payout details">
        <P>
          You must provide accurate payout details - account holder name,
          account number and IFSC, and optionally a UPI ID. Paprout cannot
          settle with you until these are filled in.
        </P>
        <P>
          Changes to your payout details are logged, with the date and the fact
          that a change occurred, as a basic fraud-awareness measure. The values
          themselves are not kept in that log.
        </P>
      </Section>

      <Section id="compliance" number="13" title="Legal compliance">
        <P>
          You are responsible for operating lawfully: your own business
          registration, any tax obligations including GST where applicable, and
          any local licensing. Paprout does not provide tax documentation on
          your behalf.
        </P>
        <P>
          If a customer asks you to print something you believe is unlawful -
          forged documents, counterfeit material, infringing copies - decline
          the order.
        </P>
      </Section>

      <Section id="suspension" number="14" title="Suspension and deactivation">
        <P>
          Paprout may deactivate a shop that breaches these terms, mishandles
          customer documents, repeatedly fails to fulfil accepted orders,
          misrepresents its pricing or location, or behaves abusively.
          Deactivation removes the shop from customer search; outstanding
          settlements for work already completed are not affected.
        </P>
      </Section>

      <Section id="disputes" number="15" title="Disputes">
        <P>
          Where a customer disputes an order, Paprout can see the order record,
          its status history and the amounts, and will try to reach a fair
          outcome between you. Paprout is not an arbitrator and cannot compel
          either side.
        </P>
        <P>
          Where a refund is agreed for work you did not carry out - an order you
          declined, or one you never accepted - that order does not become
          settleable to you.
        </P>
      </Section>

      <Section id="changes" number="16" title="Changes">
        <P>
          These terms may be updated. The date at the top of this page shows
          when they last changed. Continuing to take orders after a change means
          you accept the updated terms. Questions: {SUPPORT_EMAIL}.
        </P>
      </Section>
    </LegalPage>
  );
}
