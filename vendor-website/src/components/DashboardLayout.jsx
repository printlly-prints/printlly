import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import Sidebar, { PARTNER_NAV, PartnerPortrait } from "./Sidebar";
import DeactivatedBanner from "./DeactivatedBanner";
import { useAuth } from "../context/AuthContext";

// Shared shell for every authenticated vendor page once a shop exists:
// Website navigation stays at the top, including the mobile dropdown.
// Pages keep their own inner max-width wrapper
// (a narrow form reads better than a wide grid) - this only supplies the
// consistent frame and padding around whatever they render.
//
// DeactivatedBanner sits above that content, full-width, on every page
// this layout wraps - it renders nothing while the shop is active, so
// this is the one place it needs wiring in for it to be "across the
// dashboard" rather than just one screen.
export default function DashboardLayout({ children, title }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(null);
  const menuRef = useRef(null);
  const shopTrigger = useRef(null);
  const accountTrigger = useRef(null);
  const mobileTrigger = useRef(null);
  const heading = title || PARTNER_NAV.find(item => item.to === pathname)?.label || "Partner workspace";
  useEffect(() => { setMenuOpen(null); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const trigger = menuOpen === "shop" ? shopTrigger.current : menuOpen === "account" ? accountTrigger.current : mobileTrigger.current;
    const close = event => { if (event.key === "Escape") { setMenuOpen(null); trigger?.focus(); } };
    const outside = event => { if (!menuRef.current?.contains(event.target) && !trigger?.contains(event.target)) setMenuOpen(null); };
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector("a,button")?.focus());
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); };
  }, [menuOpen]);
  const toggleMenu = name => setMenuOpen(current => current === name ? null : name);
  return (
    <div className="partner-shell">
      <div className="partner-main">
        <header className="partner-header">
          <NavLink to="/dashboard" className="partner-header-brand"><strong>Printlly</strong><small>{heading}</small></NavLink>
          <Sidebar shopOpen={menuOpen === "shop"} shopTriggerRef={shopTrigger} onShopClick={() => toggleMenu("shop")} />
          <button ref={mobileTrigger} className="paper-button paper-button--secondary partner-mobile-primary-trigger" onClick={() => toggleMenu("mobile")} aria-label="Partner navigation" aria-controls="partner-menu" aria-expanded={menuOpen === "mobile"}>Menu</button>
          <button ref={accountTrigger} className="partner-menu-trigger partner-account-trigger" onClick={() => toggleMenu("account")} aria-label="Account menu" aria-controls="partner-menu" aria-expanded={menuOpen === "account"}><PartnerPortrait /></button>
          {menuOpen && <nav ref={menuRef} id="partner-menu" className={`partner-mobile-menu partner-menu--${menuOpen}`} aria-label={menuOpen === "shop" ? "Shop management" : menuOpen === "account" ? "Account options" : "Partner navigation destinations"}>
            {menuOpen === "mobile" && PARTNER_NAV.filter(item => ["/dashboard", "/orders", "/earnings"].includes(item.to)).map(item => <NavLink key={item.to} to={item.to} className={({isActive}) => `paper-button ${isActive ? "paper-button--primary" : "paper-button--text"}`}>{item.label}</NavLink>)}
            {menuOpen !== "account" && <><span className="partner-menu-group">Shop</span>{PARTNER_NAV.filter(item => ["/shop-profile", "/pricing", "/availability"].includes(item.to)).map(item => <NavLink key={item.to} to={item.to} className={({isActive}) => `paper-button ${isActive ? "paper-button--primary" : "paper-button--text"}`}>{item.label}</NavLink>)}</>}
            {menuOpen === "account" && <><NavLink to="/settings" className="paper-button paper-button--text">Preferences</NavLink><NavLink to="/help" className="paper-button paper-button--text">Help & support</NavLink><button className="paper-button paper-button--text" onClick={() => { logout(); navigate("/auth/vendor"); }}>Sign out</button></>}
          </nav>}
        </header>
        <DeactivatedBanner />
        <main className="partner-content">{children}</main>
      </div>
    </div>
  );
}
