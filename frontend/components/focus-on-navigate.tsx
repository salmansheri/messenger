"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * After the person goes to another screen inside the app (a link, Back), keyboard focus and a screen reader's position
 * move to that screen's heading. Without it focus stays on the link that was used, which on a phone has just left the
 * screen. The first screen of a page load is left alone, so the "Skip to content" link remains the first Tab stop.
 */
export function FocusOnNavigate() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Next moves focus itself as the new screen appears; this comes after it, to the heading.
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  return null;
}
