import { Link } from "react-router-dom";

export function Button({ to, href, variant = "primary", className = "", children, ...props }) {
  const style = `paper-button paper-button--${variant} ${className}`;
  if (to) return <Link className={style} to={to} {...props}>{children}</Link>;
  if (href) return <a className={style} href={href} {...props}>{children}</a>;
  return <button type="button" className={style} {...props}>{children}</button>;
}

export function PaperPanel({ as: Tag = "section", className = "", children, ...props }) {
  return <Tag className={`paper-panel ${className}`} {...props}>{children}</Tag>;
}

export function Artwork({ name, alt = "", className = "", ...props }) {
  return <img src={`/artwork/${name}.png`} alt={alt} className={`paper-artwork ${className}`} {...props} />;
}

export function FormField({ label, id, hint, multiline = false, ...props }) {
  const Tag = multiline ? "textarea" : "input";
  return <div className="paper-field"><label htmlFor={id}>{label}</label><Tag id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}

