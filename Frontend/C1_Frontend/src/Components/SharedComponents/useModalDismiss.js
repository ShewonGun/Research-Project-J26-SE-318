import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Keyboard/focus behaviour for a modal dialog: Escape closes it, Tab is
// trapped within the panel while open, the first field gets focus on open,
// and focus returns to whatever triggered it once the modal closes.
// Attach the returned ref to the modal's panel element.
export const useModalDismiss = (open, onClose) => {
    const panelRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const trigger = document.activeElement;
        const panel = panelRef.current;

        const first = panel?.querySelector("input, select, textarea");
        (first || panel)?.focus();

        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose?.();
                return;
            }
            if (e.key !== "Tab" || !panel) return;
            const els = Array.from(panel.querySelectorAll(FOCUSABLE));
            if (els.length === 0) return;
            const firstEl = els[0];
            const lastEl = els[els.length - 1];
            if (e.shiftKey && document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            } else if (!e.shiftKey && document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            trigger?.focus?.();
        };
    }, [open, onClose]);

    return panelRef;
};
