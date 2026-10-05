import LegalPage, { Section, P, List, Note } from "../../components/legal/LegalPage";
import {
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_HOURS,
  GRIEVANCE_EMAIL,
  LEGAL_BUSINESS_NAME,
  REGISTERED_ADDRESS,
  LEGAL_DETAILS_CONFIGURED,
} from "../../config/legal";

// Rendered as plain text, not a mailto:, when the value is still a
// placeholder - a [SUPPORT EMAIL] wrapped in a clickable link invites
// someone to click it and reach nothing.
function Channel({ label, value, href, hint }) {
  const configured = !value.startsWith("[");
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="font-heading text-[14px] font-bold text-text-primary">{label}</p>
      {configured ? (
        <a
          href={href}
          className="mt-1 block text-[15px] text-primary-bright hover:text-primary-deep transition-colors break-words"
        >
          {value}
        </a>
      ) : (
        <p className="mt-1 text-[15px] text-text-muted">{value}</p>
      )}
      {hint ? <p className="mt-1.5 text-[13px] text-text-secondary">{hint}</p> : null}
    </div>
  );
}

const TOC = [
  { id: "support", title: "Customer support" },
  { id: "in-app", title: "In-app support chat" },
  { id: "vendor", title: "Print partner support" },
  { id: "specific", title: "Specific issues" },
  { id: "grievance", title: "Formal complaints" },
  { id: "business", title: "Business details" },
];

export default function Contact() {
  return (
    <LegalPage
      title="Contact Us"
      description="How to reach Printlly support for orders, payments, refunds and partner enquiries."
      toc={TOC}
      intro={
        <P>
          The fastest way to reach us about an order is the in-app support chat,
          because it arrives with your account attached. Everything else is
          below.
        </P>
      }
    >
      <Section id="support" number="1" title="Customer support">
        <div className="grid gap-3 sm:grid-cols-2 mt-2">
          <Channel
            label="Email"
            value={SUPPORT_EMAIL}
            href={`mailto:${SUPPORT_EMAIL}`}
          />
          <Channel
            label="Phone"
            value={SUPPORT_PHONE}
            href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
            hint={SUPPORT_HOURS.startsWith("[") ? undefined : SUPPORT_HOURS}
          />
        </div>
        {!LEGAL_DETAILS_CONFIGURED ? (
          <Note>
            These contact details have not been configured for this deployment
            yet, so they are shown as placeholders rather than as working
            addresses. Until they are filled in, the in-app support chat below
            is the only channel that actually reaches anyone.
          </Note>
        ) : null}
      </Section>

      <Section id="in-app" number="2" title="In-app support chat">
        <P>
          Customers can message our support team directly from the{" "}
          <strong className="text-text-primary">Help &amp; Support</strong>{" "}
          screen in the Printlly app. Messages are delivered in real time, your
          account and order history are already attached, and replies appear in
          the same conversation.
        </P>
        <Note>
          There is no contact form on this website. Rather than show a form that
          looks like it submits and does not, we are pointing you at the channel
          that genuinely reaches our team. The in-app chat is a real, working
          feature of the Printlly app.
        </Note>
      </Section>

      <Section id="vendor" number="3" title="Print partner support">
        <P>
          Print shops with questions about registration, verification, pricing
          setup, order management or settlements can email {SUPPORT_EMAIL}.
        </P>
        <P>
          The in-app support chat is a customer feature and is not available in
          the print partner dashboard. Email is the channel for partners.
        </P>
      </Section>

      <Section id="specific" number="4" title="Specific issues">
        <List>
          <li>
            <strong className="text-text-primary">Payment taken but order
            not updated</strong> - contact support with the payment reference
            from your bank or Razorpay email. Please do not pay again.
          </li>
          <li>
            <strong className="text-text-primary">Refund requests</strong> - see
            the Cancellation &amp; Refund Policy for what to include.
          </li>
          <li>
            <strong className="text-text-primary">Print quality</strong> - speak
            to the shop at the counter first; they can usually reprint
            immediately.
          </li>
          <li>
            <strong className="text-text-primary">Account or data
            deletion</strong> - see the Account &amp; Data Deletion page.
          </li>
          <li>
            <strong className="text-text-primary">Privacy and documents</strong>{" "}
            - see the Privacy Policy, then write to us if anything is unclear.
          </li>
        </List>
      </Section>

      <Section id="grievance" number="5" title="Formal complaints">
        <P>
          If you have a formal complaint rather than a support question, write
          to {GRIEVANCE_EMAIL}. The Grievance &amp; Legal Contact page explains
          what to include.
        </P>
      </Section>

      <Section id="business" number="6" title="Business details">
        <List>
          <li>
            <strong className="text-text-primary">Operated by:</strong>{" "}
            {LEGAL_BUSINESS_NAME}
          </li>
          <li>
            <strong className="text-text-primary">Registered address:</strong>{" "}
            {REGISTERED_ADDRESS}
          </li>
        </List>
      </Section>
    </LegalPage>
  );
}
