"use client";

import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import type { PointerEvent, ReactNode } from "react";

/**
 * A card with a soft light that follows the pointer across it. The light is the accent colour at a whisper, so it
 * reads as the surface catching the light, not as decoration. Without a pointer (touch, keyboard) there is no light.
 */
export function SpotlightCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const light = useMotionTemplate`radial-gradient(360px circle at ${x}px ${y}px, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%)`;

  function move(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - box.left);
    y.set(event.clientY - box.top);
  }

  return (
    <div
      onPointerMove={move}
      onPointerLeave={() => {
        x.set(-400);
        y.set(-400);
      }}
      className={`group relative overflow-hidden rounded-lg border border-rule bg-surface/50 ${className}`}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: light }} />
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  );
}
