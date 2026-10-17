import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AppearanceControl } from "../context/ThemeContext";
import { PaperPanel } from "./PaperUI";

export function PaperRow({ to, href, title, detail, disabled = false, className = "", ...props }) {
  const content = <><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></>;
  if (disabled) return <div className={`paper-row paper-row--unavailable ${className}`} {...props}>{content}</div>;
  if (href) return <a className={`paper-row ${className}`} href={href} {...props}>{content}</a>;
  return <Link className={`paper-row ${className}`} to={to} {...props}>{content}</Link>;
}

export function PublicFooter() {
  return (
    <PaperPanel as="footer" className="public-footer">
      <h2>Printlly</h2>
      <p>From file to paper, nearby.</p>
      <nav aria-label="Printlly information">
        <PaperRow to="/auth" title="For print shops" detail="Manage incoming orders" />
        <PaperRow to="/about" title="About Printlly" detail="A simpler local print journey" />
        <PaperRow to="/help" title="Help & policies" detail="Payment, collection, privacy and terms" />
      </nav>
      <div className="public-footer-preferences"><AppearanceControl /><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
    </PaperPanel>
  );
}

export default function PublicShell({ title = "Printlly", children, footer = true }) {
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const destinations = [{to:"/",label:"Home"},{to:"/about",label:"About"},{to:"/help",label:"Help"},{to:"/auth",label:"For print shops"},{to:"/auth/get-app",label:"Get the app"}];
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = event => { if (event.key === "Escape") { setMenuOpen(false); triggerRef.current?.focus(); } };
    const outside = event => { if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setMenuOpen(false); };
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector("a")?.focus());
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); };
  }, [menuOpen]);
  useEffect(() => {
    if (!hash) { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); return undefined; }
    const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);
  return (
    <div className="public-shell" id="top">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="public-header">
        <Link to="/" className="public-wordmark" aria-label={`${title} — Printlly home`}>Printlly</Link>
        <nav className="public-top-navigation" aria-label="Primary navigation">{destinations.map(item => <NavLink end={item.to === "/"} key={item.to} to={item.to} className={({isActive}) => `paper-button ${item.to === "/auth/get-app" || isActive ? "paper-button--primary" : "paper-button--text"}`}>{item.label}</NavLink>)}</nav>
        <button ref={triggerRef} type="button" className="paper-button paper-button--secondary public-menu-trigger" aria-label="Website navigation" aria-expanded={menuOpen} aria-controls="public-menu" onClick={() => setMenuOpen(open => !open)}>Menu</button>
        {menuOpen && <nav ref={menuRef} id="public-menu" className="public-mobile-menu" aria-label="Primary navigation">{destinations.map(item => <NavLink end={item.to === "/"} key={item.to} to={item.to} className={({isActive}) => `paper-button ${isActive ? "paper-button--primary" : "paper-button--text"}`}>{item.label}</NavLink>)}</nav>}
      </header>
      <main id="main-content" className="public-content">
        {children}
        {footer && <PublicFooter />}
      </main>
    </div>
  );
}
