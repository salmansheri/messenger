import Link from "next/link";
import { ThemeSwitch } from "@/components/theme-switch";
import { APP_NAME } from "@/lib/app-name";

export function LandingFooter() {
  const link = "underline underline-offset-4 decoration-rule hover:decoration-ink";
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p className="font-serif text-lg font-semibold tracking-tight">{APP_NAME}</p>
        <nav aria-label="Account" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/sign-up" className={link}>
            Create an account
          </Link>
          <Link href="/sign-in" className={link}>
            Sign in
          </Link>
          <Link href="/forgot-password" className={link}>
            Forgot your password
          </Link>
        </nav>
        <ThemeSwitch />
      </div>
    </footer>
  );
}
