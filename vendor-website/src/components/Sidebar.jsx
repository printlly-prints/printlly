import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const PARTNER_NAV = [
  { label: "Overview", to: "/dashboard" }, { label: "Orders", to: "/orders" },
  { label: "Pricing & finishing", to: "/pricing" }, { label: "Availability", to: "/availability" },
  { label: "Earnings", to: "/earnings" }, { label: "Shop profile", to: "/shop-profile" },
  { label: "Preferences", to: "/settings" },
];

export function PartnerPortrait({ className = "" }) {
  const { shop } = useAuth();
  return <img className={`partner-portrait ${className}`} src={shop?.owner_photo_url || "/artwork/vendor-avatar.png"} alt="" />;
}

export default function Sidebar({ onShopClick, shopOpen, shopTriggerRef }) {
  return <nav className="partner-top-navigation" aria-label="Partner workspace">
    {PARTNER_NAV.filter(item => ["/dashboard", "/orders", "/earnings"].includes(item.to)).map(item => <NavLink key={item.to} to={item.to} className={({isActive}) => `paper-button partner-nav-link ${isActive ? "paper-button--primary" : "paper-button--text"}`}>{item.label}</NavLink>)}
    <button ref={shopTriggerRef} className="paper-button paper-button--text" onClick={onShopClick} aria-expanded={shopOpen} aria-controls="partner-menu">Shop <span aria-hidden="true">⌄</span></button>
  </nav>;
}
