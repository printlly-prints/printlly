import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Store,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import LandingHeader from "../components/landing/LandingHeader";
import LandingFooter from "../components/landing/LandingFooter";
import "../styles/paper.css";

gsap.registerPlugin(useGSAP);

const STEPS = [
  {
    title: "Your files, your way",
    text: "Add your PDFs. Choose colour, paper size, copies and finishing for each document.",
  },
  {
    title: "A shop around the corner",
    text: "Compare nearby shops and the price for your order. Choose the one that works for you.",
  },
  {
    title: "A little walk. All done.",
    text: "Wait for the ready notification, then collect your prints with your pickup code.",
  },
];
const QUESTIONS = [
  [
    "How do I order my prints?",
    "Get the Printlly app, upload your PDFs, set your print preferences and choose a nearby shop. Review the itemised price and pay in the app.",
  ],
  [
    "Can I choose colour and paper size?",
    "Yes. Choose colour or black & white, paper size, copies and sides for each document. Finishing options depend on the shop you select.",
  ],
  [
    "When should I go to the shop?",
    "Your order status updates in the app. Head to the shop once your order is marked ready, and show your pickup code to collect it.",
  ],
  [
    "What happens to my documents?",
    "Uploaded files are automatically deleted when the order ends. You will need to upload them again for a new order.",
  ],
];

function PrintPreview({ step }) {
  return (
    <div className="print-preview" aria-label="Example of the Printlly app">
      <div className="preview-top">
        <span className="preview-brand">Your print desk</span>
        <span className="example-label">App preview</span>
      </div>
      <div className="preview-document">
        <span className="file-icon">
          <FileText size={24} />
        </span>
        <div>
          <strong>Research-notes.pdf</strong>
          <span>12 pages · PDF document</span>
        </div>
        <span className="file-check">
          <Check size={18} />
        </span>
      </div>
      <div className="preview-content" key={step}>
        {step === 0 && (
          <>
            <div className="preview-label">Make it yours</div>
            <div className="print-options">
              <span className="option-selected">Black & white</span>
              <span>Colour</span>
            </div>
            <div className="preview-setting">
              <span>Paper size</span>
              <strong>
                A4 <ChevronDown size={14} />
              </strong>
            </div>
            <div className="preview-setting">
              <span>Sides</span>
              <strong>
                Double-sided <ChevronDown size={14} />
              </strong>
            </div>
            <div className="preview-setting">
              <span>Copies</span>
              <strong>1 copy</strong>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="preview-label">Choose your print shop</div>
            <div className="preview-shop">
              <Store size={24} />
              <div>
                <strong>Your neighbourhood shop</strong>
                <span>Prices and availability in the app</span>
              </div>
            </div>
            <div className="preview-setting">
              <span>Your preferences</span>
              <strong>12 pages · A4</strong>
            </div>
            <div className="preview-setting">
              <span>Before you pay</span>
              <strong>Review itemised total</strong>
            </div>
            <p className="preview-note">
              Your shop. Your order. One clear price.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <div className="preview-ready">
              <span>
                <Check size={18} />
              </span>
              Ready for pickup
            </div>
            <p className="preview-note">
              Your prints are waiting at your selected shop.
            </p>
            <div className="pickup-example">
              <span>Pickup code</span>
              <strong>• • • • • •</strong>
              <small>Your code appears in the paid order</small>
            </div>
          </>
        )}
      </div>
      <div className="preview-bottom">
        <ShieldCheck size={16} />
        <span>Files deleted after your order ends</span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const root = useRef(null);
  const [step, setStep] = useState(0);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const intro = gsap.from(".hero-enter", {
          y: 16,
          opacity: 0,
          duration: 0.6,
          stagger: 0.07,
          ease: "power2.out",
          clearProps: "all",
        });
        const finish = () => intro.progress(1);
        root.current.addEventListener("pointerdown", finish, { once: true });
        root.current.addEventListener("keydown", finish, { once: true });
        return () => {
          root.current?.removeEventListener("pointerdown", finish);
          root.current?.removeEventListener("keydown", finish);
        };
      });
      return () => media.revert();
    },
    { scope: root },
  );

  return (
    <div className="paper-theme paper-page" ref={root}>
      <LandingHeader />
      <main id="main-content">
        <div className="paper-wrap">
          <section className="paper-hero" id="top" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="hero-eyebrow hero-enter">
                <span className="registration-mark" aria-hidden="true">
                  +
                </span>
                Your local printing companion
              </p>
              <h1 id="hero-title" className="hero-enter">
                Your next print,
                <br />
                minus the wait<span>.</span>
              </h1>
              <p className="hero-description hero-enter">
                Upload from your phone. Choose a nearby print shop. Pick up when
                it’s ready.
              </p>
              <div className="paper-actions hero-enter">
                <Link className="paper-button" to="/auth/get-app">
                  Get Printlly <ArrowUpRight size={19} />
                </Link>
                <a className="paper-text-link" href="#how-it-works">
                  See how it works <ArrowDown size={17} />
                </a>
              </div>
              <p className="hero-footnote hero-enter">
                <MapPin size={15} />A little walk. A fresh stack of prints.
              </p>
            </div>
            <div className="hero-visual hero-enter">
              <div className="hero-art">
                <div className="art-paper art-paper-back" aria-hidden="true" />
                <div className="art-paper art-paper-front" aria-hidden="true">
                  <span className="paper-corner" />
                  <span className="paper-rule rule-one" />
                  <span className="paper-rule rule-two" />
                  <span className="paper-rule rule-three" />
                </div>
                <img
                  className="hero-person"
                  src="/art/themes/pickup-cmyk.webp"
                  width="1024"
                  height="1536"
                  fetchpriority="high"
                  alt="Printlly’s illustrated customer carrying freshly printed pages and a pickup ticket, in cyan and yellow"
                />
                <div className="hero-file-label">
                  <span className="label-icon">
                    <FileText size={20} />
                  </span>
                  <div>
                    <strong>From screen to paper</strong>
                    <span>At a shop around the corner</span>
                  </div>
                  <Check size={18} />
                </div>
                <span className="art-registration top-left" aria-hidden="true">
                  +
                </span>
                <span
                  className="art-registration bottom-right"
                  aria-hidden="true"
                >
                  +
                </span>
              </div>
              <p className="hero-art-note">Paperwork, with personality.</p>
            </div>
          </section>
          <div className="print-service-rail" aria-label="Printlly features">
            <span>
              <FileText size={18} />
              Everyday documents
            </span>
            <span>
              <SlidersHorizontal size={18} />
              Your print preferences
            </span>
            <span>
              <MapPin size={18} />
              Local shop pickup
            </span>
            <span>
              <ShieldCheck size={18} />
              Automatic file deletion
            </span>
          </div>

          <section
            id="how-it-works"
            className="print-workflow"
            aria-labelledby="workflow-title"
          >
            <div className="workflow-copy">
              <p className="paper-kicker">Less counter time. More you time.</p>
              <h2 id="workflow-title">
                A clear path
                <br />
                to paper.
              </h2>
              <div
                className="workflow-steps"
                aria-label="Explore the ordering steps"
              >
                {STEPS.map((item, index) => (
                  <button
                    className={
                      "workflow-step" + (step === index ? " is-active" : "")
                    }
                    key={item.title}
                    type="button"
                    onClick={() => setStep(index)}
                    aria-pressed={step === index}
                    aria-controls="workflow-preview"
                  >
                    <span className="step-number">0{index + 1}</span>
                    <span className="step-copy">
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </span>
                    <ArrowUpRight className="step-arrow" size={20} />
                  </button>
                ))}
              </div>
            </div>
            <div className="workflow-visual" id="workflow-preview">
              <div className="workflow-visual-top">
                <span className="paper-kicker">One order, start to finish</span>
                <span className="step-counter">0{step + 1} / 03</span>
              </div>
              <PrintPreview step={step} />
              <div className="workflow-progress" aria-hidden="true">
                {STEPS.map((item, index) => (
                  <span
                    key={item.title}
                    className={index === step ? "is-active" : ""}
                  />
                ))}
              </div>
            </div>
          </section>

          <section
            className="neighbourhood-layout"
            id="shops"
            aria-labelledby="shops-title"
          >
            <div className="neighbourhood-art">
              <span className="neighbourhood-arch" aria-hidden="true" />
              <img
                src="/art/themes/shopkeeper-cmyk.webp"
                width="1024"
                height="1536"
                alt="Printlly’s illustrated shopkeeper holding a customer’s finished print order"
                loading="lazy"
              />
              <span className="shop-art-ticket">
                <Store size={18} />
                Your local print shop
              </span>
            </div>
            <div className="neighbourhood-copy">
              <p className="paper-kicker">Your neighbourhood, connected</p>
              <h2 id="shops-title">
                Big on convenience.
                <br />
                Local at heart.
              </h2>
              <p>
                For the assignment due tomorrow, the presentation that matters,
                and the everyday paperwork. Get it printed by a shop near you.
              </p>
              <div className="local-service-list">
                <span>
                  <Check size={17} />
                  Compare prices for your actual order
                </span>
                <span>
                  <Check size={17} />
                  Choose the available finishing options
                </span>
                <span>
                  <Check size={17} />
                  Know when your prints are ready
                </span>
              </div>
              <Link to="/auth/get-app" className="paper-button">
                Find shops in the app <ArrowUpRight size={19} />
              </Link>
            </div>
          </section>

          <section className="paper-help" aria-labelledby="faq-title">
            <div>
              <p className="paper-kicker">Before you press print</p>
              <h2 id="faq-title">
                A few good <br />
                questions.
              </h2>
              <Link className="paper-text-link" to="/faq">
                Visit the help centre <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className="paper-questions">
              {QUESTIONS.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span className="question-plus" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
          <aside className="partner-note">
            <div className="partner-note-icon">
              <img
                src="/art/themes/paper-pal-cmyk.webp"
                width="60"
                height="80"
                alt=""
                loading="lazy"
              />
            </div>
            <div>
              <h3>Run a print shop?</h3>
              <p>
                Bring your counter online. Manage orders, pricing and pickups in
                one place.
              </p>
            </div>
            <Link to="/auth/vendor" className="paper-text-link">
              Become a print partner <ArrowUpRight size={20} />
            </Link>
          </aside>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
