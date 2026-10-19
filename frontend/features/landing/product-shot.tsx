"use client";

import { motion, useScroll, useSpring, useTransform } from "motion/react";
import Image from "next/image";
import { useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * The app itself, tipped back in space and levelling out as it scrolls into the middle of the screen, with the accent
 * glowing behind it. The tilt follows the scroll position, so it goes back if you scroll back up. With reduced motion
 * it simply sits flat.
 */
export function ProductShot() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.92", "start 0.2"] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.6 });
  const rotateX = useTransform(progress, [0, 1], [reduced ? 0 : 26, 0]);
  const scale = useTransform(progress, [0, 1], [reduced ? 1 : 0.9, 1]);
  const lift = useTransform(progress, [0, 1], [reduced ? 0 : 48, 0]);
  const glow = useTransform(progress, [0, 1], [reduced ? 1 : 0.3, 1]);

  return (
    <div ref={ref} className="relative mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20" style={{ perspective: 1500 }}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-[8%] top-10 h-3/4 blur-3xl"
        style={{
          opacity: glow,
          background:
            "radial-gradient(ellipse 60% 55% at 50% 40%, color-mix(in oklab, var(--accent) 45%, transparent), transparent 70%)",
        }}
      />
      <motion.div
        className="relative rounded-xl border border-rule bg-surface/80 p-1.5 sm:p-2.5"
        style={{
          rotateX,
          scale,
          y: lift,
          transformOrigin: "50% 0%",
          // A whole window with a crisp edge, lifted off the page by an ink shadow (depth) and a wash of the accent
          // (warmth). A fade would turn a dark window on light paper into mud, so there is none.
          boxShadow:
            "0 1px 0 0 color-mix(in oklab, var(--ink) 8%, transparent), 0 28px 56px -28px color-mix(in oklab, var(--ink) 45%, transparent), 0 60px 110px -60px color-mix(in oklab, var(--accent) 34%, transparent)",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-16 -top-px h-px"
          style={{
            background: "linear-gradient(to right, transparent, color-mix(in oklab, var(--accent) 80%, transparent), transparent)",
          }}
        />
        {/* On a phone the whole window would be too small to read, so it is shown zoomed in on the Messages. */}
        <div className="overflow-hidden rounded-lg border border-rule max-sm:h-[18rem]">
          <Image
            src="/landing/conversation-window.png"
            alt="Messenger open on a Conversation: the list of Conversations on the left, and on the right a column of Messages with names on a rail and times in the margin."
            width={1559}
            height={599}
            sizes="(min-width: 1152px) 1100px, 100vw"
            loading="eager"
            fetchPriority="high"
            className="block h-auto w-full max-sm:-mt-[9%] max-sm:-ml-[62%] max-sm:w-[300%] max-sm:max-w-none"
          />
        </div>
      </motion.div>
    </div>
  );
}
