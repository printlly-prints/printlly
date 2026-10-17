import LegalPage, { Section, P, List } from "../../components/legal/LegalPage";
import { LEGAL_BUSINESS_NAME, SUPPORT_EMAIL, FACTS } from "../../config/legal";
import { Button, PaperPanel } from "../../components/PaperUI";

const TOC = [
  { id: "what", title: "What Printlly is" },
  { id: "customers", title: "For customers" },
  { id: "partners", title: "For print partners" },
  { id: "documents", title: "How we treat your documents" },
  { id: "where", title: "Where Printlly operates" },
  { id: "who", title: "Who operates Printlly" },
];

export default function About() {
  return (
    <LegalPage
      title="About Printlly"
      hero={<><section className="public-hero about-hero"><div className="public-hero-copy"><h1>Less waiting.<br />More paper.</h1><p>Printlly connects your documents with local print shops. See your options, pay online and collect with a clear pickup ticket.</p><Button to="/auth">Get Printlly</Button></div></section><PaperPanel><h2>Built around the print</h2><p>Set print options for each file, find nearby shops and follow your order.</p></PaperPanel></>}
      description="Printlly connects customers with nearby print shops: upload, pay online, collect in person."
      toc={TOC}
      intro={
        <P>
          Printlly connects people who need something printed with nearby print
          shops. You upload your documents, choose how you want them printed,
          pay online, and collect them from the shop you picked - without
          queueing to explain what you need or waiting while it is done.
        </P>
      }
    >
      <Section id="what" number="1" title="What Printlly is">
        <P>
          Printlly is a marketplace. The printing is done by independent print
          shops who join the platform, set their own prices, and fulfil orders
          themselves. Printlly provides the part in between: finding a shop,
          handling the files, pricing the job, taking payment, and verifying
          the handover.
        </P>
        <P>
          We are not a print shop and do not operate any printing equipment.
        </P>
      </Section>

      <Section id="customers" number="2" title="For customers">
        <List>
          <li>
            Upload up to {FACTS.maxFilesPerUpload} PDFs at a time, each up to{" "}
            {FACTS.maxFileSizeMb} MB.
          </li>
          <li>
            Choose per document: black &amp; white or colour, paper size, single
            or double sided, how many copies, and any extra services the shop
            offers such as binding.
          </li>
          <li>
            See the price before you pay. The page count is measured from your
            file on our server, so the quote reflects the actual document.
          </li>
          <li>
            Compare what different nearby shops would charge for the same job.
          </li>
          <li>
            Track the order from accepted to ready for pickup, and collect it
            with a {FACTS.otpDigits}-digit pickup code.
          </li>
        </List>
      </Section>

      <Section id="partners" number="3" title="For print partners">
        <List>
          <li>
            Register a shop, submit verification documents, and go live once
            approved.
          </li>
          <li>Set your own rates for every print option and add-on service.</li>
          <li>
            Receive paid orders only - an unpaid order never reaches your
            queue.
          </li>
          <li>
            Mark yourself open, busy or closed as your workload changes.
          </li>
          <li>
            Confirm each handover with the customer's pickup code, and track
            what you are owed.
          </li>
        </List>
      </Section>

      <Section id="documents" number="4" title="How we treat your documents">
        <P>
          The documents people print are often personal - medical records, legal
          papers, identity documents, coursework. We treat them as something to
          be passed through rather than kept: a document is visible only to the
          shop you selected, is used only to print your order, and is deleted
          once the order is completed or expires.
        </P>
        <P>
          The Privacy Policy sets out exactly what happens and when, including
          the parts that are scheduled rather than instant.
        </P>
      </Section>

      <Section id="where" number="5" title="Where Printlly operates">
        <P>
          Printlly is built for India. Prices are in Indian rupees and payments
          are processed through Razorpay. Which shops are available to you
          depends on which have joined and been verified near you.
        </P>
      </Section>

      <Section id="who" number="6" title="Who operates Printlly">
        <P>
          Printlly is operated by {LEGAL_BUSINESS_NAME}. For business or press
          enquiries, write to {SUPPORT_EMAIL}.
        </P>
      </Section>
    </LegalPage>
  );
}
