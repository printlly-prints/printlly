import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, Search, X } from "lucide-react";
import "../../styles/paper.css";

const NAV = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Find a shop", href: "/#shops" },
];
const COMMANDS = [
  ...NAV,
  { label: "For print shops", to: "/print-partners" },
  { label: "Partner sign-in", to: "/auth/vendor" },
  { label: "Get the Paprout app", to: "/auth/get-app" },
  { label: "Help & questions", to: "/faq" },
  { label: "Contact us", to: "/contact" },
];

export function PaperWordmark() {
  return (
    <span className="paper-wordmark">
      <img src="/brand/paprout-mark.png" width="34" height="40" alt="" />
      <span>Paprout</span>
    </span>
  );
}

export default function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const header = useRef(null);
  const menuButton = useRef(null);
  const commandButton = useRef(null);
  const dialog = useRef(null);
  const search = useRef(null);
  const { pathname, hash } = useLocation();
  const results = COMMANDS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );
  const returnSearchFocus = () => {
    const target = commandButton.current?.offsetParent
      ? commandButton.current
      : menuButton.current;
    target?.focus();
  };
  const closeCommand = () => {
    dialog.current?.close();
    returnSearchFocus();
  };
  const showCommand = () => {
    setQuery("");
    setOpen(false);
    if (!dialog.current?.open) dialog.current?.showModal();
    search.current?.focus();
  };

  useEffect(() => {
    setOpen(false);
    dialog.current?.close();
  }, [pathname, hash]);
  useEffect(() => {
    const keydown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialog.current?.open ? closeCommand() : showCommand();
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const outside = (event) => {
      if (!header.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  const navLink = (item, props = {}) =>
    item.to ? (
      <Link key={item.label} to={item.to} {...props}>
        {item.label}
      </Link>
    ) : (
      <a key={item.label} href={item.href} {...props}>
        {item.label}
      </a>
    );

  return (
    <>
      <header className="paper-theme paper-header" ref={header}>
        <a href="#main-content" className="paper-skip">
          Skip to content
        </a>
        <div className="paper-wrap paper-nav-row">
          <a href="/#top" aria-label="Paprout home">
            <PaperWordmark />
          </a>
          <nav className="paper-desktop-nav" aria-label="Main navigation">
            {NAV.map((item) => navLink(item))}
          </nav>
          <div className="paper-nav-actions">
            <button
              type="button"
              className="paper-command-button"
              onClick={showCommand}
              ref={commandButton}
              aria-label="Search pages"
              aria-keyshortcuts="Control+k Meta+k"
            >
              <Search size={17} />
              <kbd>Ctrl K</kbd>
            </button>
            <Link to="/print-partners" className="paper-partner-link">
              <span className="partner-label-desktop">For print shops</span>
              <span className="partner-label-mobile">For shops</span>
            </Link>
            <Link to="/auth/get-app" className="paper-button nav-app-button">
              Get the app <ArrowUpRight size={17} />
            </Link>
            <button
              className="paper-menu-button"
              type="button"
              ref={menuButton}
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="paper-mobile-menu"
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {open && (
          <nav
            id="paper-mobile-menu"
            className="paper-mobile-menu paper-wrap"
            aria-label="Mobile navigation"
          >
            {NAV.map((item) =>
              navLink(item, { onClick: () => setOpen(false) }),
            )}
            <Link to="/print-partners" onClick={() => setOpen(false)}>
              For print shops
            </Link>
            <Link to="/auth/vendor" onClick={() => setOpen(false)}>
              Partner sign-in
            </Link>
            <Link to="/faq" onClick={() => setOpen(false)}>
              Help & questions
            </Link>
            <button
              type="button"
              className="paper-text-link"
              onClick={showCommand}
            >
              <Search size={16} />
              Search pages
            </button>
          </nav>
        )}
      </header>
      <dialog
        className="paper-theme paper-command-dialog"
        ref={dialog}
        aria-labelledby="command-title"
        onClick={(event) => {
          if (event.target === dialog.current) closeCommand();
        }}
        onClose={returnSearchFocus}
      >
        <div className="command-heading">
          <Search size={20} />
          <label className="sr-only" id="command-title" htmlFor="paper-search">
            Find a page
          </label>
          <input
            id="paper-search"
            ref={search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Where would you like to go?"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                dialog.current?.querySelector(".command-results a")?.focus();
              }
            }}
          />
          <button
            type="button"
            onClick={closeCommand}
            aria-label="Close search"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="command-results" aria-label="Search results">
          {results.length ? (
            results.map((item) =>
              navLink(item, {
                onClick: closeCommand,
                className: "command-result",
              }),
            )
          ) : (
            <p>No pages found. Try “app”, “shop” or “help”.</p>
          )}
        </nav>
        <div className="command-hint">
          <span>Navigate with Tab</span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </dialog>
    </>
  );
}
