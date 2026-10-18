import type { ReactNode } from "react";
import { SignedInShell } from "@/components/signed-in-shell";
import { RequireSession } from "@/features/session/require-session";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <SignedInShell>{children}</SignedInShell>
    </RequireSession>
  );
}
