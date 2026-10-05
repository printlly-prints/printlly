import { useEffect } from "react";
import { Link } from "react-router-dom";
import LandingHeader from "../landing/LandingHeader";
import LandingFooter from "../landing/LandingFooter";
import { LEGAL_DETAILS_CONFIGURED, POLICY_LAST_UPDATED } from "../../config/legal";

// Shared shell for every legal and information page.
//
// Reuses the marketing header and footer rather than inventing a chrome of
// its own, so a customer who clicks "Privacy Policy" in the footer stays
// visibly inside the same product. The body deliberately breaks from the
// landing page's full-bleed sections: these pages exist to be READ, so the
// measure is capped and the type is set larger and looser than the dashboard's.
//
// There is no SEO/meta library in this project (no react-helmet), so the
// document title is set directly. That is the whole of the metadata system
// that exists here - adding a dependency for twelve static pages would be a
// bigger change than the pages themselves.

function useDocumentMeta(title, description) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} · Printlly`;

    let tag = document.querySelector('meta[name="description"]');
    const created = !tag;
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      document.head.appendChild(tag);
    }
    const previousDescription = tag.getAttribute("content");
    if (description) tag.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      if (created) tag.remove();
      else if (previousDescription !== null) tag.setAttribute("content", previousDescription);
    };
  }, [title, description]);
}

// Shown at the top of every policy while the business details are still
// placeholders. Deliberately impossible to miss: these pages are the ones a
// customer reaches when something has gone wrong, and sending them to a
// [SUPPORT EMAIL] that looks like a real address would waste the one attempt
// they make to reach somebody.
function UnconfiguredNotice() {
  if (LEGAL_DETAILS_CONFIGURED) return null;
  return (
    <div
      role="note"
      className="mb-8 rounded-panel border border-busy/40 bg-busy-bg px-5 py-4"
    >
      <p className="font-heading text-[14px] font-bold text-busy-text">
        Draft - business details not yet configured
      </p>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-busy-text/90">
        This page still contains placeholders such as [LEGAL BUSINESS NAME] and
        [SUPPORT EMAIL]. The real values have not been added to this
        deployment, and nothing on this page should be treated as a published
        policy until they are and the text has been reviewed by a legal
        professional.
      </p>
    </div>
  );
}

// A section heading that is also a link target, so the table of contents and
// any deep link into a specific clause both work.
export function Section({ id, number, title, children }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-heading text-[19px] sm:text-[21px] font-bold text-text-primary mt-11 mb-3">
        {number ? `${number}. ` : ""}
        {title}
      </h2>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

export function P({ children }) {
  return <p className="text-[15px] leading-[1.75] text-text-secondary">{children}</p>;
}

export function Sub({ title, children }) {
  return (
    <>
      <h3 className="font-heading text-[15.5px] font-bold text-text-primary mt-4">{title}</h3>
      {children}
    </>
  );
}

export function List({ children, ordered = false }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={`flex flex-col gap-2 pl-5 text-[15px] leading-[1.75] text-text-secondary ${
        ordered ? "list-decimal" : "list-disc"
      }`}
    >
      {children}
    </Tag>
  );
}

// For a fact that must not be read as a promise - "we do not currently do X".
// Visually quieter than a warning, because most of these are simply the
// honest state of the product rather than a problem.
export function Note({ children }) {
  return (
    <div className="rounded-card border border-border bg-background-soft px-4 py-3.5">
      <p className="text-[14px] leading-[1.7] text-text-secondary">{children}</p>
    </div>
  );
}

export default function LegalPage({ title, description, intro, toc, children }) {
  useDocumentMeta(title, description);

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="max-w-[760px] mx-auto px-5 sm:px-6 pt-28 pb-20">
        <nav aria-label="Breadcrumb" className="mb-5">
          <ol className="flex items-center gap-2 text-[13px] text-text-muted">
            <li>
              <Link to="/" className="hover:text-primary-bright transition-colors">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-text-secondary">{title}</li>
          </ol>
        </nav>

        <h1 className="font-heading text-[28px] sm:text-[34px] font-extrabold tracking-[-0.02em] text-text-primary">
          {title}
        </h1>
        <p className="mt-2 text-[13.5px] text-text-muted">
          Last updated: {POLICY_LAST_UPDATED}
        </p>

        <div className="mt-8">
          <UnconfiguredNotice />
        </div>

        {intro ? <div className="flex flex-col gap-3.5">{intro}</div> : null}

        {toc?.length ? (
          <nav
            aria-label="On this page"
            className="mt-9 rounded-panel border border-border bg-surface p-5"
          >
            <h2 className="font-heading text-[13.5px] font-bold text-text-primary">
              On this page
            </h2>
            <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 list-decimal pl-5">
              {toc.map((item) => (
                <li key={item.id} className="text-[13.5px]">
                  <a
                    href={`#${item.id}`}
                    className="text-text-secondary hover:text-primary-bright transition-colors"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <article>{children}</article>
      </main>

      <LandingFooter />
    </div>
  );
}
