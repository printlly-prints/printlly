import { useEffect, useRef, useState } from "react";

// Fades + lifts its children in once, the first time they scroll into
// view, then stops observing. Deliberately not reversible: replaying on
// scroll-up is the thing that makes reveal animations feel gimmicky.
//
// Falls back to visible-immediately where IntersectionObserver is
// missing, so content is never trapped at opacity 0.
export default function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  lineVariant = false,
  ...rest
}) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.unobserve(entry.target);
          }
        });
      },
      // A small negative bottom margin means the reveal fires just after
      // the element edge appears, rather than the instant it clips in.
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-revealed={revealed ? "true" : "false"}
      style={delay ? { "--reveal-delay": `${delay}ms` } : undefined}
      className={`${lineVariant ? "draw-line" : "reveal"} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
