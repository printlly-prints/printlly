import LegalPage, { Section, P, List, Note } from "../../components/legal/LegalPage";
import { SUPPORT_EMAIL, FACTS } from "../../config/legal";

const TOC = [
  { id: "how", title: "How to request deletion" },
  { id: "no-button", title: "Why there is no delete button" },
  { id: "deleted", title: "What gets deleted" },
  { id: "retained", title: "What has to be kept" },
  { id: "documents", title: "Your uploaded documents" },
  { id: "active", title: "Active orders" },
  { id: "vendors", title: "Print partner accounts" },
  { id: "partial", title: "Deleting less than everything" },
  { id: "after", title: "After deletion" },
];

export default function DataDeletion() {
  return (
    <LegalPage
      title="Account & Data Deletion"
      description="How to ask Paprout to delete your account, what is removed, and what must be retained."
      toc={TOC}
      intro={
        <P>
          You can ask us to delete your Paprout account and the personal
          information attached to it. This page explains how to ask and what
          actually happens - including the parts that cannot be deleted.
        </P>
      }
    >
      <Section id="how" number="1" title="How to request deletion">
        <P>
          Email <strong className="text-text-primary">{SUPPORT_EMAIL}</strong>{" "}
          from the email address registered to your account, with "Delete my
          account" in the subject line.
        </P>
        <P>Please include:</P>
        <List>
          <li>the email address and phone number on the account;</li>
          <li>
            whether you want the whole account deleted, or only certain
            information;
          </li>
          <li>
            for print partners, your shop name.
          </li>
        </List>
        <P>
          We may ask you to confirm from the registered address before acting,
          because deletion is irreversible and we would rather be sure the
          request is really from you.
        </P>
        <P>
          Customers can also raise this through the Help &amp; Support chat in
          the Paprout app.
        </P>
      </Section>

      <Section id="no-button" number="2" title="Why there is no delete button">
        <Note>
          Paprout does not currently have a self-service "delete my account"
          control in the app or the dashboard. Deletion is handled manually by
          our team on request. We would rather say that plainly than put a
          button on this page that does not do anything.
        </Note>
        <P>
          Self-service deletion is a feature we intend to build. Until it
          exists, the email route above is the real process.
        </P>
      </Section>

      <Section id="deleted" number="3" title="What gets deleted">
        <P>When we delete an account, the following is removed:</P>
        <List>
          <li>your name, email address and phone number;</li>
          <li>
            your password hash - which is all we ever held; we never stored the
            password itself;
          </li>
          <li>your linked Google identifier, if you signed in with Google;</li>
          <li>
            your active sessions, so every device is signed out immediately;
          </li>
          <li>
            your registered push notification tokens, so no further
            notifications are sent to your devices;
          </li>
          <li>your saved shops;</li>
          <li>your in-app notifications;</li>
          <li>your support conversation history;</li>
          <li>
            for print partners: your shop profile, photos, verification
            documents and payout details.
          </li>
        </List>
      </Section>

      <Section id="retained" number="4" title="What has to be kept">
        <P>
          Some records cannot simply be erased, because they are the record of
          a financial transaction between you, a print shop and a payment
          processor.
        </P>
        <List>
          <li>
            <strong className="text-text-primary">Order and payment
            records</strong> - the date, the shop, the amounts charged, the
            platform fee and the payment reference. These may need to be
            retained for accounting, tax and dispute-resolution purposes, and
            the print shop's settlement for that work depends on them.
          </li>
          <li>
            <strong className="text-text-primary">Payment records held by
            Razorpay</strong> - these are Razorpay's own records of a payment
            they processed. Deleting your Paprout account does not and cannot
            delete them.
          </li>
          <li>
            <strong className="text-text-primary">Settlement records</strong>{" "}
            for print partners, for the same accounting reasons.
          </li>
        </List>
        <P>
          Where a record must be kept, we remove or disconnect the personal
          details attached to it so far as we are able, leaving the transaction
          itself rather than an identifiable profile.
        </P>
      </Section>

      <Section id="documents" number="5" title="Your uploaded documents">
        <P>
          Your documents are already deleted in the ordinary course of using
          Paprout, without you having to ask:
        </P>
        <List>
          <li>when the order is completed;</li>
          <li>
            when an order expires - after{" "}
            {FACTS.unpaidOrderExpiryHours} hour if never paid for, or{" "}
            {FACTS.acceptedOrderExpiryHours} hours if never completed;
          </li>
          <li>
            after {FACTS.orphanUploadRetentionHours} hours for a file you
            uploaded but never ordered.
          </li>
        </List>
        <P>
          So by the time you request account deletion, your documents will
          almost always already be gone. Anything still present is removed as
          part of the deletion.
        </P>
        <P>
          What we cannot reach is a copy a print shop made outside the platform.
          Print partners are contractually prohibited from retaining customer
          documents, but a physical printout is not something our systems can
          delete.
        </P>
      </Section>

      <Section id="active" number="6" title="Active orders">
        <P>
          We cannot delete an account with an order still in progress. A print
          shop may have already printed your job, and your pickup OTP is what
          lets you collect it.
        </P>
        <P>
          Either collect or resolve your outstanding orders first, or let them
          run to completion or expiry. We will tell you if this is holding up
          your request.
        </P>
      </Section>

      <Section id="vendors" number="7" title="Print partner accounts">
        <P>
          If you run a shop, we cannot delete your account while you have
          orders in progress or an unsettled balance. Those need to be completed
          and settled first - deleting the account would remove the record of
          what you are owed.
        </P>
        <P>
          If you want to stop taking orders without deleting anything, you can
          deactivate your shop from the dashboard at any time. That removes it
          from customer search immediately and is reversible.
        </P>
      </Section>

      <Section id="partial" number="8" title="Deleting less than everything">
        <P>
          You do not have to delete the whole account to stop most data being
          collected:
        </P>
        <List>
          <li>
            Turn off notifications in your device settings, or sign out, and we
            stop sending to that device.
          </li>
          <li>
            Decline location access, and the app stops using your location to
            sort shops.
          </li>
          <li>
            Sign out, and your session is revoked server-side immediately -
            not just on your device.
          </li>
        </List>
      </Section>

      <Section id="after" number="9" title="After deletion">
        <P>
          Deletion is permanent. Your order history and support conversations
          cannot be restored afterwards, and signing up again creates a new
          account with nothing carried over.
        </P>
        <P>
          We will confirm by email once your request has been actioned. We are
          not publishing a guaranteed turnaround, because no such service
          commitment has been established yet; we will handle it as quickly as
          we can and keep you informed.
        </P>
      </Section>
    </LegalPage>
  );
}
