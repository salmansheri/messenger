"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import type { PointerEvent } from "react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { AccountLinks } from "./account-links";
import { useClock, useSequence } from "./timing";

const LINES = ["Conversations,", "set in type."];

/** Stay on each step this long (ms): typing, line one and typing, line two, sent, delivered. Then it is read. */
const STEPS = [1000, 1000, 800, 550, 500];

/** The same three pulsing dots the app shows while someone types. */
function TypingDots() {
  return (
    <span aria-hidden className="absolute top-[0.55em] left-4 flex items-center gap-1.5 sm:left-6">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="size-2 rounded-full bg-ink-muted"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.18 }}
        />
      ))}
    </span>
  );
}

/** How far a Message has got, as in the app: one dot sent, two delivered, two in the accent read. */
function Receipt({ stage }: { stage: "sent" | "delivered" | "read" | undefined }) {
  if (!stage) return <span className="h-3" />;
  return (
    <motion.span
      key={stage}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
      className={`block font-mono text-xs leading-none tracking-tighter ${stage === "read" ? "text-accent" : "text-ink-muted"}`}
    >
      {stage === "sent" ? "•" : "••"}
    </motion.span>
  );
}

/**
 * The headline is set the way the app sets a conversation (a rail, times in the margin) and arrives the way Messages
 * do: typing, a line, typing, a line, then the dots that say it was read. It is one orchestrated moment on load;
 * everything below it rests. With reduced motion, or without scripts, the finished headline is simply there.
 */
export function Hero() {
  const reduced = usePrefersReducedMotion();
  const phase = useSequence(STEPS, reduced, 350);
  const time = useClock();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 90, damping: 20 });
  const sy = useSpring(y, { stiffness: 90, damping: 20 });
  const follow = useMotionTemplate`radial-gradient(420px circle at ${sx}px ${sy}px, color-mix(in oklab, var(--accent) 13%, transparent), transparent 70%)`;

  function move(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - box.left);
    y.set(event.clientY - box.top);
  }

  const receipt = phase >= 5 ? "read" : phase === 4 ? "delivered" : phase === 3 ? "sent" : undefined;
  const reveal = (shown: boolean) =>
    shown ? { opacity: 1, filter: "blur(0px)", y: 0 } : { opacity: 0, filter: "blur(10px)", y: 14 };
  const column = "grid grid-cols-[3.4rem_1fr] sm:grid-cols-[4.4rem_1fr]";

  return (
    <section onPointerMove={move} className="relative isolate overflow-hidden px-5 pt-16 pb-6 sm:pt-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--rule) 1px, transparent 1px), linear-gradient(to bottom, var(--rule) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(ellipse 75% 70% at 50% 0%, black 0%, transparent 78%)",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[34rem]"
          style={{
            background:
              "radial-gradient(ellipse 55% 60% at 50% 0%, color-mix(in oklab, var(--accent) 24%, transparent), transparent 72%)",
          }}
        />
        <motion.div className="absolute inset-0 hidden [@media(hover:hover)]:block" style={{ background: follow }} />
      </div>

      <noscript>
        <style>{".hero-line [data-reveal],.hero-after{opacity:1!important;filter:none!important;transform:none!important}"}</style>
      </noscript>

      <div className="mx-auto w-fit max-w-full">
        <h1 className="font-serif text-[clamp(2.7rem,8.6vw,6.6rem)] leading-[1.04] font-light tracking-[-0.035em]">
          {LINES.map((line, index) => (
            <span key={line} className={`hero-line ${column}`}>
              <span aria-hidden className="flex flex-col items-start gap-1.5 pt-3 sm:pt-5">
                <time className="font-mono text-xs tracking-normal text-ink-muted">{phase > index ? time : ""}</time>
                {index === LINES.length - 1 && <Receipt stage={receipt} />}
              </span>
              <span className="relative block border-l-2 border-accent pl-4 sm:pl-6">
                {phase === index && !reduced && <TypingDots />}
                <motion.span
                  data-reveal
                  className="block"
                  initial={false}
                  animate={reveal(phase > index)}
                  transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {line}
                </motion.span>
              </span>
            </span>
          ))}
        </h1>

        <motion.div
          className={`hero-after mt-10 ${column}`}
          initial={false}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <span aria-hidden />
          <div className="max-w-[34rem] pl-4 sm:pl-6">
            <p className="text-lg leading-relaxed text-ink-muted">
              A messenger that sets every Message as a line in a column: names on a rail, times in the margin, no
              bubbles.
            </p>
            <div className="mt-7">
              <AccountLinks size="large" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
