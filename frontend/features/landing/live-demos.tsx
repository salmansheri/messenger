"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { SpotlightCard } from "./spotlight-card";
import { useLoop } from "./timing";

const SWAP = { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] } as const;

/** One line of a conversation, set as the app sets it: time in the margin, a rail, the words. */
function Line({ time, own, who, children, mark }: { time: string; own?: boolean; who?: string; children: ReactNode; mark?: ReactNode }) {
  return (
    <div className="grid grid-cols-[3.2rem_1fr] gap-x-3">
      <div className="flex flex-col items-start gap-1 pt-1">
        <span className="font-mono text-xs text-ink-muted">{time}</span>
        {mark}
      </div>
      <div className={`border-l-2 pl-3 ${own ? "border-accent" : "border-rule"}`}>
        {who && <p className="font-serif text-sm font-semibold">{who}</p>}
        <p className="leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="size-2 shrink-0 rounded-full bg-accent" />;
}

function Caption({ title, children, className = "border-t" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col justify-center border-rule p-6 sm:p-8 ${className}`}>
      <h3 className="font-serif text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-md leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

/** A Message goes from sent to delivered to read, and the mark says so. */
function Receipts({ running, reduced }: { running: boolean; reduced: boolean }) {
  const step = useLoop([1500, 1500, 2800], running, reduced);
  const stage = (["Sent", "Delivered", "Read"] as const)[step];
  return (
    <div aria-hidden className="flex flex-1 flex-col justify-center gap-5 p-6 text-[0.95rem] sm:p-8">
      <Line time="14:02" who="Ada Lovelace">
        Have you looked at the notes on the engine yet?
      </Line>
      <Line
        time="14:03"
        own
        who="You"
        mark={
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={stage}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className={`font-mono text-xs leading-none tracking-tighter ${stage === "Read" ? "text-accent" : "text-ink-muted"}`}
            >
              {stage === "Sent" ? "•" : "••"}
            </motion.span>
          </AnimatePresence>
        }
      >
        Reading them now. Section G is the one to watch.
      </Line>
      <div className="grid grid-cols-[3.2rem_1fr] gap-x-3">
        <span />
        <ul className="flex flex-wrap gap-x-7 gap-y-2 border-t border-rule pt-4 text-sm">
          {(["Sent", "Delivered", "Read"] as const).map((name, index) => (
            <li key={name} className={`flex items-center gap-2 transition-colors duration-300 ${name === stage ? "text-ink" : "text-ink-muted"}`}>
              <span className={`font-mono text-xs tracking-tighter transition-colors duration-300 ${name === stage && name === "Read" ? "text-accent" : ""}`}>
                {index === 0 ? "•" : "••"}
              </span>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Someone comes online, starts typing, and the Message arrives; later they are last seen. */
function PresenceAndTyping({ running, reduced }: { running: boolean; reduced: boolean }) {
  const step = useLoop([1800, 1400, 2200, 2800], running, reduced);
  const online = step > 0;
  return (
    <div aria-hidden className="flex flex-col gap-3 p-6 text-[0.95rem] sm:p-8">
      <div>
        <p className="font-serif text-lg font-semibold">Ada Lovelace</p>
        <div className="flex h-6 items-center gap-2 text-sm text-ink-muted">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={online ? "online" : "away"} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={SWAP} className="flex items-center gap-2">
              {online && <Dot />}
              {online ? "Online" : "Last seen today at 14:02"}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <div className="flex min-h-[4.5rem] items-center">
        <AnimatePresence mode="wait" initial={false}>
          {step === 2 && (
            <motion.p key="typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SWAP} className="flex items-center gap-2 text-sm text-ink-muted">
              Ada is typing
              <span className="flex items-center gap-1">
                {[0, 1, 2].map((dot) => (
                  <motion.span key={dot} className="size-1 rounded-full bg-current" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.18 }} />
                ))}
              </span>
            </motion.p>
          )}
          {step === 3 && (
            <motion.div key="message" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SWAP} className="w-full">
              <Line time="14:05">The engine is ready for the notes.</Line>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A Group's Participants, and an Admin making a member an Admin. */
function GroupRoles({ running, reduced }: { running: boolean; reduced: boolean }) {
  const step = useLoop([2200, 1000, 3000], running, reduced);
  const promoted = step === 2;
  return (
    <div aria-hidden className="flex flex-col gap-3 p-6 text-[0.95rem] sm:p-8">
      <p className="text-sm text-ink-muted">Analytical Engine · Participants (3)</p>
      <ul className="flex flex-col gap-2.5">
        <li className="flex items-baseline gap-3">
          <span className="font-serif font-semibold">Me Myself (you)</span>
          <span className="text-sm text-ink-muted">Admin</span>
        </li>
        <li className="flex min-h-7 items-center gap-3">
          <span className="font-serif font-semibold">Grace Hopper</span>
          <span className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Dot />
            Online
          </span>
          <span className="ml-auto flex items-center">
            <AnimatePresence mode="wait" initial={false}>
              {promoted ? (
                <motion.span key="admin" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }} className="text-sm text-accent">
                  Admin
                </motion.span>
              ) : (
                <motion.span
                  key="make"
                  exit={{ opacity: 0 }}
                  animate={{ scale: step === 1 ? 0.94 : 1 }}
                  transition={{ duration: 0.15 }}
                  className={`rounded-sm px-2 py-0.5 text-sm underline underline-offset-4 ${step === 1 ? "bg-accent text-on-accent no-underline" : "decoration-rule"}`}
                >
                  Make Admin
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="font-serif font-semibold">Linus Torvalds</span>
          <span className="text-sm text-ink-muted">Last seen yesterday at 18:20</span>
        </li>
      </ul>
    </div>
  );
}

/**
 * Three small, live pictures of what the app does, drawn in the app's own words and marks. Each one only runs while it
 * is on screen, and each rests on its most complete frame when the person asks for less motion.
 */
export function LiveDemos() {
  const reduced = usePrefersReducedMotion();
  const first = useRef<HTMLDivElement>(null);
  const second = useRef<HTMLDivElement>(null);
  const third = useRef<HTMLDivElement>(null);
  const seeFirst = useInView(first, { margin: "-10% 0px" });
  const seeSecond = useInView(second, { margin: "-10% 0px" });
  const seeThird = useInView(third, { margin: "-10% 0px" });

  return (
    <section id="live" aria-labelledby="live-heading" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <h2 id="live-heading" className="max-w-2xl font-serif text-4xl leading-[1.08] font-light tracking-[-0.025em] sm:text-5xl">
        Everything arrives as it happens.
      </h2>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
        Messages, receipts, who is online and who is typing all update live, in the same quiet type as the rest.
      </p>

      <div className="mt-12 grid gap-4 lg:grid-cols-5">
        <SpotlightCard className="flex flex-col lg:col-span-3">
          <div ref={first} className="flex flex-1 flex-col">
            <Receipts running={seeFirst} reduced={reduced} />
          </div>
          <Caption title="Know how far it got.">
            One dot means sent. Two mean delivered. Two in the accent colour mean read. In a Group, a Message counts as
            read only when everyone else has read it.
          </Caption>
        </SpotlightCard>

        <SpotlightCard className="flex flex-col lg:col-span-2">
          <div ref={second} className="flex flex-1 flex-col justify-center">
            <PresenceAndTyping running={seeSecond} reduced={reduced} />
          </div>
          <Caption title="See who is there.">
            A dot when someone is online, their last seen time when they are not, and a line while they type.
          </Caption>
        </SpotlightCard>

        <SpotlightCard className="lg:col-span-5">
          <div className="grid h-full lg:grid-cols-2">
            <div ref={third} className="flex flex-col justify-center">
              <GroupRoles running={seeThird} reduced={reduced} />
            </div>
            <Caption title="Groups with roles." className="border-t lg:border-t-0 lg:border-l">
              Admins add, remove and promote. Everyone else can read, write and leave. Changes show for every
              Participant at once, and a Participant who is removed sees the Conversation leave their list.
            </Caption>
          </div>
        </SpotlightCard>
      </div>
    </section>
  );
}
