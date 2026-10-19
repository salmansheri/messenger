"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { API_URL } from "@/lib/api";
import { session } from "@/lib/auth/app-session";
import { createConnection, type Connection, type ConnectionStatus } from "@/lib/realtime/connection";
import { catchUp, handleEvent } from "./sync";

const socketUrl = `${API_URL.replace(/^http/, "ws")}/ws`;

/** The access token to present: the current one, or a fresh one if it has run out (which ends the session if that fails). */
async function currentToken() {
  if (!session.token()) await session.refresh();
  return session.token();
}

const ConnectionContext = createContext<Connection | null>(null);

/**
 * Keeps one live connection for the signed-in area: opened when it appears, closed when it goes (signing out), and
 * reopened with the new token whenever the session renews, because the server closes a socket whose token ran out.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connection] = useState(() =>
    createConnection({
      url: socketUrl,
      getToken: currentToken,
      onEvent: (body) => handleEvent(queryClient, body),
      onConnected: () => catchUp(queryClient),
    }),
  );

  useEffect(() => {
    connection.start();
    const stopListening = session.onTokenReplaced(() => connection.reopen());
    return () => {
      stopListening();
      connection.stop();
    };
  }, [connection]);

  return <ConnectionContext value={connection}>{children}</ConnectionContext>;
}

/** Whether the live connection is up. Outside the provider it reads as connected (nothing to report). */
export function useConnectionStatus(): ConnectionStatus {
  const connection = useContext(ConnectionContext);
  return useSyncExternalStore(
    (listener) => connection?.subscribe(listener) ?? (() => {}),
    () => connection?.getStatus() ?? "connected",
    () => "connected",
  );
}
