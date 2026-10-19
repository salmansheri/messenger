"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useReceiptReporter } from "@/features/receipts/receipts-provider";

/**
 * Reports what has been read: the newest Message from someone else that has been on screen (`data-seq` rows inside
 * `scroller`; half of a row, or half the screen for a very long one, counts as seen). It is reported only while this
 * tab is the one in use (visible and focused), and again when the tab or window comes back, so what was on screen
 * while it was away counts then. `rows` changes whenever the rows do, so new ones are watched.
 */
export function useReportReading(scroller: RefObject<HTMLElement | null>, conversationId: string, rows: unknown) {
  const reporter = useReceiptReporter();
  const mostSeen = useRef(0);

  const reportSeen = useCallback(() => {
    if (mostSeen.current > 0 && document.visibilityState === "visible" && document.hasFocus()) {
      reporter.read(conversationId, mostSeen.current);
    }
  }, [reporter, conversationId]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const half = (entry.rootBounds?.height ?? 0) / 2;
          const seen = entry.isIntersecting && (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= half);
          const seq = Number((entry.target as HTMLElement).dataset.seq);
          if (seen && seq > mostSeen.current) mostSeen.current = seq;
        }
        reportSeen();
      },
      { root: element, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    element.querySelectorAll("[data-seq]").forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [scroller, rows, reportSeen]);

  useEffect(() => {
    window.addEventListener("focus", reportSeen);
    document.addEventListener("visibilitychange", reportSeen);
    return () => {
      window.removeEventListener("focus", reportSeen);
      document.removeEventListener("visibilitychange", reportSeen);
    };
  }, [reportSeen]);
}
