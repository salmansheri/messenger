"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { API_URL } from "@/lib/api";
import { session } from "@/lib/auth/app-session";
import { createConnection, type Connection, type ConnectionStatus } from "@/lib/realtime/connection";
import { createTypingTracker, type TypingTracker } from "@/features/presence/typing-tracker";
import { catchUp, handleEvent } from "./sync";

const socketUrl = `${API_URL.replace(/^http/, "ws")}/ws`;

/** The access token to present: the current one, or a fresh one if it has run out (which ends the session if that fails). */
async function currentToken() {
  if (!session.token()) await session.refresh();
  return session.token();
}

type Live = { connection: Connection; typing: TypingTracker };
const LiveContext = createContext<Live | null>(null);

/**
 * Keeps one live connection for the signed-in area: opened when it appears, closed when it goes (signing out), and
 * reopened with the new token whenever the session renews, because the server closes a socket whose token ran out.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [typing] = useState(() => createTypingTracker());
  const [connection] = useState(() =>
    createConnection({
      url: socketUrl,
      getToken: currentToken,
      onEvent: (body) => handleEvent(queryClient, body, typing),
      onConnected: () => {
        typing.clear(); // nothing said while the connection was down can be believed
        catchUp(queryClient);
      },
    }),
  );
  const live = useMemo(() => ({ connection, typing }), [connection, typing]);

  useEffect(() => {
    connection.start();
    const stopListening = session.onTokenReplaced(() => connection.reopen());
    return () => {
      stopListening();
      connection.stop();
    };
  }, [connection]);

  return <LiveContext value={live}>{children}</LiveContext>;
}

/** Whether the live connection is up. Outside the provider it reads as connected (nothing to report). */
export function useConnectionStatus(): ConnectionStatus {
  const connection = useContext(LiveContext)?.connection;
  return useSyncExternalStore(
    (listener) => connection?.subscribe(listener) ?? (() => {}),
    () => connection?.getStatus() ?? "connected",
    () => "connected",
  );
}

const NOBODY: readonly string[] = [];

/** The ids of the people typing in a Conversation right now. */
export function useTypingUsers(conversationId: string): readonly string[] {
  const typing = useContext(LiveContext)?.typing;
  return useSyncExternalStore(
    (listener) => typing?.subscribe(listener) ?? (() => {}),
    () => typing?.typing(conversationId) ?? NOBODY,
    () => NOBODY,
  );
}

/** Says to the others in a Conversation that this person is typing (or has stopped). Dropped while not connected. */
export function useTypingPublisher(conversationId: string): (typing: boolean) => void {
  const connection = useContext(LiveContext)?.connection;
  return useMemo(
    () => (typing: boolean) => connection?.publish(`/app/conversations/${conversationId}/typing`, { typing }),
    [connection, conversationId],
  );
}
