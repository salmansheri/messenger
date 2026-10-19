import type { Metadata } from "next";
import { SkipLink } from "@/components/skip-link";
import { Closing } from "@/features/landing/closing";
import { Hero } from "@/features/landing/hero";
import { LandingFooter } from "@/features/landing/landing-footer";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingMotion } from "@/features/landing/landing-motion";
import { LiveDemos } from "@/features/landing/live-demos";
import { Principles } from "@/features/landing/principles";
import { ProductShot } from "@/features/landing/product-shot";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = {
  title: `${APP_NAME} · Conversations, set in type`,
  description:
    "A messenger that sets every Message as a line in a column: names on a rail, times in the margin, no bubbles. Live Messages, receipts, presence and Groups.",
};

export default function Home() {
  return (
    <LandingMotion>
      <SkipLink />
      <LandingHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <Hero />
        <ProductShot />
        <LiveDemos />
        <Principles />
        <Closing />
      </main>
      <LandingFooter />
    </LandingMotion>
  );
}
