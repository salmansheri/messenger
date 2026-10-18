"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { call, sdk, toProblem } from "@/lib/api";
import { session } from "@/lib/auth/app-session";
import { messageFor } from "@/lib/api/messages";
import { useMe } from "./use-me";

export function SettingsView() {
  const queryClient = useQueryClient();
  const me = useMe();

  const signOut = useMutation({
    mutationFn: () => call(sdk.logout()),
    onSuccess: () => {
      queryClient.clear();
      session.end(); // the signed-in area then sends the person to sign-in

    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Settings</h1>

      <section aria-labelledby="account" className="mt-8">
        <h2 id="account" className="font-serif text-lg font-semibold">
          Your account
        </h2>
        {me.isPending && (
          <p className="mt-2 text-ink-muted" aria-busy="true">
            Loading your details…
          </p>
        )}
        {me.isError && (
          <div className="mt-2">
            <Notice tone="problem">{messageFor(toProblem(me.error))}</Notice>
          </div>
        )}
        {me.data && (
          <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-2">
            <dt className="text-ink-muted">Name</dt>
            <dd>{me.data.displayName}</dd>
            <dt className="text-ink-muted">Email</dt>
            <dd>{me.data.email}</dd>
          </dl>
        )}
      </section>

      <section aria-labelledby="session" className="mt-10 border-t border-rule pt-6">
        <h2 id="session" className="font-serif text-lg font-semibold">
          Session
        </h2>
        <p className="mt-2 text-ink-muted">Signing out ends your session in this browser.</p>
        {signOut.isError && (
          <div className="mt-3">
            <Notice tone="problem">
              Could not sign you out: {messageFor(toProblem(signOut.error))} You are still signed in.
            </Notice>
          </div>
        )}
        <div className="mt-4">
          <Button variant="primary" onClick={() => signOut.mutate()} busy={signOut.isPending}>
            {signOut.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </section>
    </div>
  );
}
