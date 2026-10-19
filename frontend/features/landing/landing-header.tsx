import Link from "next/link";
import { ThemeSwitch } from "@/components/theme-switch";
import { APP_NAME } from "@/lib/app-name";
import { AccountLinks } from "./account-links";

/** The top of the landing page: the name, two places further down, the ways in and the theme. It blurs what scrolls under it. */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule/70 bg-paper/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-serif text-xl font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <nav aria-label="On this page" className="hidden items-center gap-6 text-sm text-ink-muted sm:flex">
            <a href="#live" className="hover:text-ink">
              Live
            </a>
            <a href="#principles" className="hover:text-ink">
              Principles
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-5">
          <AccountLinks />
          <div className="hidden lg:block">
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </header>
  );
}
