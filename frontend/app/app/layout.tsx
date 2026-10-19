import { Suspense, type ReactNode } from "react";
import { SignedInShell } from "@/components/signed-in-shell";
import { RealtimeProvider } from "@/features/realtime/realtime-provider";
import { RequireSession } from "@/features/session/require-session";

export default function SignedInLayout({ children }: { children: ReactNode }) {
  // The whole signed-in area is rendered in the browser (the access token lives only in memory, docs/adr/0003), and it
  // reads the address (usePathname, useParams), which on a Conversation's page is only known per request: React needs
  // a boundary above the first such read.
  return (
    <Suspense fallback={null}>
      <RequireSession>
        <RealtimeProvider>
          <SignedInShell>{children}</SignedInShell>
        </RealtimeProvider>
      </RequireSession>
    </Suspense>
  );
}
