"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Motion for the whole landing page: a person who asks their system for less motion gets no movement of position or size. */
export function LandingMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
