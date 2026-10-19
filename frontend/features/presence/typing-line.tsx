"use client";

import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { useTypingUsers } from "@/features/realtime/realtime-provider";
import { typingText } from "./text";

/** Three dots that pulse in turn; still when the person prefers reduced motion. */
function Dots() {
  const reduce = usePrefersReducedMotion();
  return (
    // Keyed by the preference: an animation already running is not stopped by taking away its `animate` prop, so a change of
    // the setting while the dots are showing replaces them.
    <span key={reduce ? "still" : "moving"} aria-hidden className="ml-1 inline-flex items-center gap-0.5">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="inline-block size-1 rounded-full bg-current"
          style={{ opacity: reduce ? 0.6 : undefined }}
          animate={reduce ? undefined : { opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.2 }}
        />
      ))}
    </span>
  );
}

/**
 * "Ada is typing…" above the writing box. The line is always there (empty when nobody is typing), so it takes the
 * same room either way and a screen reader hears it appear.
 */
export function TypingLine({
  conversationId,
  names,
}: {
  conversationId: string;
  names: Map<string | undefined, string | undefined>;
}) {
  const typing = useTypingUsers(conversationId);
  const line = typingText(typing.map((userId) => names.get(userId) ?? "Someone")).replace(/…$/, "");
  return (
    <p role="status" className="flex h-6 items-center px-4 text-sm text-ink-muted sm:px-8">
      {line}
      {line && <Dots />}
    </p>
  );
}
