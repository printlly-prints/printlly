import LegalPage, { Section, P, List, Note } from "../../components/legal/LegalPage";
import {
  LEGAL_BUSINESS_NAME,
  REGISTERED_ADDRESS,
  GRIEVANCE_EMAIL,
  LEGAL_EMAIL,
  LEGAL_DETAILS_CONFIGURED,
} from "../../config/legal";

const TOC = [
  { id: "who", title: "Who to contact" },
  { id: "entity", title: "Business and legal entity" },
  { id: "how", title: "How to submit a complaint" },
  { id: "include", title: "What to include" },
  { id: "process", title: "What happens next" },
  { id: "takedown", title: "Content and copyright complaints" },
  { id: "privacy", title: "Privacy and data complaints" },
];

export default function Grievance() {
  return (
    <LegalPage
      title="Grievance & Legal Contact"
      description="How to raise a formal complaint with Printlly, and where to send legal notices."
      toc={TOC}
      intro={
        <P>
          This page is for formal complaints and legal correspondence. For
          ordinary order problems - a late print, a refund question - the
          in-app support chat or the Contact Us page will usually get you a
          faster answer.
        </P>
      }
    >
      <Section id="who" number="1" title="Who to contact">
        <List>
          <li>
            <strong className="text-text-primary">Grievances:</strong>{" "}
            {GRIEVANCE_EMAIL}
          </li>
          <li>
            <strong className="text-text-primary">Legal notices:</strong>{" "}
            {LEGAL_EMAIL}
          </li>
        </List>
        <Note>
          Printlly has not yet appointed a named Grievance Officer, and no
          officer's name, designation or direct contact details are published
          here. Inventing them would be worse than their absence: a complaint
          addressed to a person who does not exist goes nowhere. Complaints sent
          to the address above reach the team responsible for them.
        </Note>
      </Section>

      <Section id="entity" number="2" title="Business and legal entity">
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
        {!LEGAL_DETAILS_CONFIGURED ? (
          <Note>
            The entity details above are placeholders. Printlly's registered
            name and address have not been configured for this deployment, and
            none has been invented to fill the gap. These must be completed
            before this page is published.
          </Note>
        ) : null}
      </Section>

      <Section id="how" number="3" title="How to submit a complaint">
        <P>
          Email {GRIEVANCE_EMAIL} with "Grievance" in the subject line. Written
          complaints to the registered address above are also accepted.
        </P>
      </Section>

      <Section id="include" number="4" title="What to include">
        <P>
          The more of this you can give us, the faster we can look into it
          without having to write back for details:
        </P>
        <List>
          <li>Your name and the email address or phone number on your account.</li>
          <li>
            The order concerned - the date, the shop, and the amount charged.
          </li>
          <li>
            Any payment reference from your bank or from Razorpay, if the
            complaint involves money.
          </li>
          <li>A clear description of what happened and when.</li>
          <li>What you would like done about it.</li>
          <li>Any screenshots or correspondence that help.</li>
        </List>
        <P>
          Please do not attach the printed documents themselves unless they are
          directly relevant - we do not need copies of your personal paperwork
          to investigate most complaints.
        </P>
      </Section>

      <Section id="process" number="5" title="What happens next">
        <P>
          We will acknowledge your complaint, look into the order record and the
          shop's side of it, and write back with an outcome.
        </P>
        <Note>
          We are deliberately not publishing a guaranteed acknowledgement or
          resolution time. No such service commitment has been established for
          Printlly yet, and a stated timeline we have not organised ourselves to
          meet would be a promise rather than a fact. We will respond as quickly
          as we can.
        </Note>
      </Section>

      <Section id="takedown" number="6" title="Content and copyright complaints">
        <P>
          If you believe someone has used Printlly to print material that
          infringes your copyright or is otherwise unlawful, write to{" "}
          {LEGAL_EMAIL} with details of the material and your rights in it.
        </P>
        <P>
          Please note what Printlly can and cannot do here. We do not review,
          moderate or retain the contents of customer documents, and documents
          are deleted once an order is completed or expires. By the time a
          complaint reaches us the file will usually no longer exist on our
          systems. We can act on the account concerned, and we will cooperate
          with lawful requests from a court or authorised authority.
        </P>
      </Section>

      <Section id="privacy" number="7" title="Privacy and data complaints">
        <P>
          Complaints about how your personal information or documents have been
          handled can be sent to {GRIEVANCE_EMAIL}. The Privacy Policy sets out
          what we collect, who can see your documents, and when they are
          deleted.
        </P>
      </Section>
    </LegalPage>
  );
}
