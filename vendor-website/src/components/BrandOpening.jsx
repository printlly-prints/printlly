import { useEffect, useRef, useState } from "react";
import tokens from "../../../shared/design-tokens.json";

let shown = false;

/** Active Figma plane 265:493; a brief, decorative entrance leaves content ready. */
export default function BrandOpening() {
  const [visible, setVisible] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if ((shown && !started.current) || reduced.matches) return undefined;
    shown = true;
    started.current = true;
    setVisible(true);
    const end = () => setVisible(false);
    const timer = setTimeout(end, tokens.motion.deliberate);
    reduced.addEventListener("change", end);
    return () => { clearTimeout(timer); reduced.removeEventListener("change", end); };
  }, []);
  return visible ? <div className="brand-opening" aria-hidden="true" style={{ animationDuration: `${tokens.motion.deliberate}ms` }}><img src="/artwork/opening-plane.svg" width="72" height="60" alt="" /></div> : null;
}
