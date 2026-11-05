import { useEffect, useRef } from "react";

const dialogs = [];
let previousOverflow = "";
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

/** Nested order/document dialogs close and trap focus only in the top layer. */
export default function useDialogFocus(ref, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return undefined;
    const previousFocus = document.activeElement;
    if (!dialogs.length) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    const childIndex = dialogs.findIndex(dialog => panel.contains(dialog));
    if (childIndex < 0) dialogs.push(panel);
    else dialogs.splice(childIndex, 0, panel);
    panel.focus();
    function keyDown(event) {
      if (dialogs.at(-1) !== panel) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll(FOCUSABLE)].filter(element => element.getClientRects().length);
      if (!controls.length) { event.preventDefault(); panel.focus(); return; }
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("keydown", keyDown);
      const index = dialogs.indexOf(panel);
      if (index >= 0) dialogs.splice(index, 1);
      if (!dialogs.length) document.body.style.overflow = previousOverflow;
      const remaining = dialogs.at(-1);
      if (previousFocus?.isConnected && (!remaining || remaining.contains(previousFocus))) previousFocus.focus();
      else remaining?.focus();
    };
  }, [ref]);
}
