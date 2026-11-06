import LegalPage, { Section, P } from "../../components/legal/LegalPage";
import { SUPPORT_EMAIL, FACTS } from "../../config/legal";

// Native <details> rather than a JS accordion: it is keyboard accessible,
// works without JavaScript, and is searchable by the browser's own find.
function Q({ q, children }) {
  return (
    <details className="group rounded-card border border-border bg-surface overflow-hidden">
      <summary className="cursor-pointer list-none px-4 py-3.5 flex items-start gap-3 hover:bg-background-soft transition-colors">
        <span className="font-heading text-[14.5px] font-bold text-text-primary flex-1">
          {q}
        </span>
        <svg
          className="shrink-0 mt-0.5 text-text-muted transition-transform duration-200 group-open:rotate-180"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="px-4 pb-4 pt-0.5 flex flex-col gap-2.5 text-[14.5px] leading-[1.7] text-text-secondary">
        {children}
      </div>
    </details>
  );
}

function Group({ children }) {
  return <div className="flex flex-col gap-2.5 mt-2">{children}</div>;
}

const TOC = [
  { id: "basics", title: "Getting started" },
  { id: "ordering", title: "Placing an order" },
  { id: "paying", title: "Paying" },
  { id: "pickup", title: "Collecting your order" },
  { id: "problems", title: "When things go wrong" },
  { id: "privacy", title: "Documents and privacy" },
  { id: "partners", title: "For print partners" },
];

export default function Faq() {
  return (
    <LegalPage
      title="Frequently Asked Questions"
      description="How ordering, paying, pickup, refunds and document handling work on Paprout."
      toc={TOC}
      intro={
        <P>
          Answers describe what Paprout does today. Where a feature does not
          exist yet, the answer says so rather than describing something
          planned.
        </P>
      }
    >
      <Section id="basics" number="1" title="Getting started">
        <Group>
          <Q q="What is Paprout?">
            <p>
              A marketplace connecting you with nearby print shops. You upload
              documents, choose how they should be printed, pay online, and
              collect the prints from the shop you picked. The printing is done
              by independent shops, not by Paprout.
            </p>
          </Q>
          <Q q="Do I need an account?">
            <p>
              Yes. Uploading a document and placing an order both require you to
              be signed in, because your documents and orders are tied to your
              account.
            </p>
          </Q>
          <Q q="Is there a Paprout app?">
            <p>
              Customers order through the Paprout mobile app. This website is
              the print partner dashboard and the public information site.
            </p>
          </Q>
        </Group>
      </Section>

      <Section id="ordering" number="2" title="Placing an order">
        <Group>
          <Q q="How do I place a print order?">
            <p>
              Upload your documents, set the print options for each one, pick a
              shop, and pay. Your order reaches the shop only once payment is
              confirmed.
            </p>
          </Q>
          <Q q="What files can I upload?">
            <p>
              PDFs - up to {FACTS.maxFilesPerUpload} per order, each up to{" "}
              {FACTS.maxFileSizeMb} MB.
            </p>
          </Q>
          <Q q="How is the page count calculated?">
            <p>
              Our server reads each PDF and counts its pages. You do not enter
              it, and the app does not estimate it, so the price is based on the
              real document.
            </p>
          </Q>
          <Q q="Can I choose colour or black & white?">
            <p>
              Yes, per document - along with paper size, single or double sided,
              and the number of copies. Different documents in the same order
              can have different settings.
            </p>
          </Q>
          <Q q="Can I add binding or other extras?">
            <p>
              If the shop offers them. Each shop lists its own add-on services
              and rates, so what is available varies between shops.
            </p>
          </Q>
          <Q q="Can I add special instructions?">
            <p>Yes, there is an instructions field on the order.</p>
          </Q>
          <Q q="Why do prices differ between shops?">
            <p>
              Each shop sets its own rates. You can compare what nearby shops
              would charge for the same job before choosing.
            </p>
          </Q>
          <Q q="Is there a platform fee?">
            <p>
              Yes. Paprout adds a platform fee, shown as a separate line in the
              total before you pay.
            </p>
          </Q>
        </Group>
      </Section>

      <Section id="paying" number="3" title="Paying">
        <Group>
          <Q q="How do I pay?">
            <p>
              Online through Razorpay, which supports UPI, cards, net banking
              and wallets. Paprout never sees or stores your card or UPI
              details.
            </p>
          </Q>
          <Q q="Is cash on pickup possible?">
            <p>No. Orders are paid online before they reach the shop.</p>
          </Q>
          <Q q="What happens after payment?">
            <p>
              Your pickup OTP is generated, the order appears in the shop's
              queue, and you are notified as it moves to accepted and then ready
              for pickup.
            </p>
          </Q>
          <Q q="My payment went through but the order still says unpaid.">
            <p>
              Razorpay also confirms payments to our server directly, so this
              usually corrects itself within moments even if your app closed
              mid-payment. If it does not, contact support with the payment
              reference - and do not pay again.
            </p>
          </Q>
          <Q q="Do I get a GST invoice?">
            <p>
              Paprout does not currently generate invoices or GST invoices
              through the platform. See the Payment &amp; Billing page.
            </p>
          </Q>
        </Group>
      </Section>

      <Section id="pickup" number="4" title="Collecting your order">
        <Group>
          <Q q="How do I know when my order is ready?">
            <p>
              The order status changes to ready for pickup, and you get a
              notification in the app - plus a push notification if you have
              allowed them.
            </p>
          </Q>
          <Q q="What is the pickup OTP?">
            <p>
              A {FACTS.otpDigits}-digit code generated once your payment is
              confirmed. You give it to the shop when collecting. The shop
              cannot mark an order complete without entering it correctly, which
              is what stops your documents being handed to someone else.
            </p>
          </Q>
          <Q q="Can someone else collect my order?">
            <p>
              There is no separate feature for nominating someone. In practice
              anyone with your OTP can collect, so sharing it means authorising
              them. Treat it like any one-time password.
            </p>
          </Q>
          <Q q="Does Paprout deliver to my home?">
            <p>
              No. Paprout is collect-in-person only. There is no delivery
              option, no delivery address and no delivery charge.
            </p>
          </Q>
          <Q q="How long will my order take?">
            <p>
              That depends on the shop and its queue; Paprout does not set or
              guarantee a turnaround. A shop can mark itself busy, in which case
              the app shows a longer preparation estimate that the shop chose.
            </p>
          </Q>
        </Group>
      </Section>

      <Section id="problems" number="5" title="When things go wrong">
        <Group>
          <Q q="What if the shop rejects my order?">
            <p>
              A shop can decline a paid order. Nothing has been printed, so a
              refund is appropriate - contact support.
            </p>
          </Q>
          <Q q="What if I don't collect my order?">
            <p>
              An order not completed within {FACTS.acceptedOrderExpiryHours}{" "}
              hours is marked expired and its documents are deleted. If the shop
              had already printed it, a refund is not normally due, since the
              materials and time were used.
            </p>
          </Q>
          <Q q="Can I cancel an order?">
            <p>
              Before paying, just abandon it - an unpaid order expires by itself
              after {FACTS.unpaidOrderExpiryHours} hour and costs you nothing.
              After paying there is no self-service cancel button; contact
              support as soon as possible and we will see what is possible
              depending on whether the shop has started printing.
            </p>
          </Q>
          <Q q="How are refunds handled?">
            <p>
              Not automatically. Every refund is reviewed and arranged manually
              by our support team, then processed through Razorpay back to your
              original payment method. The Cancellation &amp; Refund Policy sets
              out when a refund is appropriate.
            </p>
          </Q>
          <Q q="The print quality is poor.">
            <p>
              Raise it with the shop at the counter - they can usually reprint
              on the spot. If that does not work, contact Paprout support.
              Printing is done by independent shops, so we cannot compel a
              reprint, but we will try to reach a fair outcome.
            </p>
          </Q>
        </Group>
      </Section>

      <Section id="privacy" number="6" title="Documents and privacy">
        <Group>
          <Q q="What happens to my uploaded documents?">
            <p>
              They are stored with our storage provider, made available to the
              one shop you selected so they can print them, and deleted when the
              order is completed or expires. A file you uploaded but never
              ordered is deleted after {FACTS.orphanUploadRetentionHours} hours.
            </p>
          </Q>
          <Q q="Can other shops see my documents?">
            <p>
              No. Only the shop fulfilling your order can open it, and every
              request is checked against the order.
            </p>
          </Q>
          <Q q="Does Paprout read my documents?">
            <p>
              Only to count the pages, automatically, so the order can be
              priced. We do not open, index, analyse or share the contents.
            </p>
          </Q>
          <Q q="How do I delete my account?">
            <p>
              There is no self-service delete button yet. Email {SUPPORT_EMAIL}{" "}
              from your registered address and we will handle it. The Account
              &amp; Data Deletion page explains what gets deleted and what has to
              be kept.
            </p>
          </Q>
        </Group>
      </Section>

      <Section id="partners" number="7" title="For print partners">
        <Group>
          <Q q="How do I register my shop?">
            <p>
              Sign up on this site as a print partner, create your shop profile
              with address, contact and photos, then submit an identity document
              for verification. Your shop becomes visible to customers once an
              administrator approves it.
            </p>
          </Q>
          <Q q="How do I set my pricing?">
            <p>
              From the Pricing page in your dashboard. You set your own rates
              for black &amp; white and colour, paper sizes, double-sided
              printing, and any add-on services you want to offer.
            </p>
          </Q>
          <Q q="How do I accept orders?">
            <p>
              Paid orders appear in your Orders dashboard. You accept an order,
              print it, then mark it ready for pickup. Unpaid orders never reach
              you.
            </p>
          </Q>
          <Q q="How does customer pickup work?">
            <p>
              The customer shows you their {FACTS.otpDigits}-digit OTP. You enter
              it to complete the order. Without the correct code the order
              cannot be completed - this protects the customer's documents.
            </p>
          </Q>
          <Q q="How and when do I get paid?">
            <p>
              Customers pay Paprout, and Paprout settles with you separately.
              Your Earnings page shows your unsettled balance and your
              settlement history. Transfers are made manually outside the
              platform by UPI or bank transfer and then recorded against your
              account - so you must fill in your payout details for a settlement
              to be possible.
            </p>
          </Q>
          <Q q="Can I temporarily stop taking orders?">
            <p>
              Yes - mark your shop busy to keep taking orders with a longer
              preparation estimate, or closed to stop receiving them. You can
              also deactivate the shop entirely, which removes it from search
              while leaving existing orders intact.
            </p>
          </Q>
          <Q q="How do I contact support?">
            <p>
              Email {SUPPORT_EMAIL}. The in-app chat is a customer feature and
              is not available in the partner dashboard.
            </p>
          </Q>
        </Group>
      </Section>
    </LegalPage>
  );
}
