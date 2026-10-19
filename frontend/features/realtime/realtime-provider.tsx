"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { API_URL, type ConversationResponse, type UserProfile } from "@/lib/api";
import { session } from "@/lib/auth/app-session";
import { createConnection, type Connection, type ConnectionStatus } from "@/lib/realtime/connection";
import { parseEvent } from "@/lib/realtime/events";
import { conversationsKey } from "@/features/conversations/queries";
import { catchUpHistory } from "@/features/messages/catch-up";
import type { History } from "@/features/messages/history";
import { messagesKey } from "@/features/messages/queries";
import { applyToHistory, applyToList } from "./apply-event";

const socketUrl = `${API_URL.replace(/^http/, "ws")}/ws`;

/** The access token to present: the current one, or a fresh one if it has run out (which ends the session if that fails). */
async function currentToken() {
  if (!session.token()) await session.refresh();
  return session.token();
}

/** Puts one event into what is already loaded; anything that cannot be worked out from it asks the server again. */
function handleEvent(queryClient: QueryClient, body: string) {
  const event = parseEvent(body);
  if (!event) return;

  const list = queryClient.getQueryData<ConversationResponse[]>(conversationsKey);
  if (list) {
    const myId = queryClient.getQueryData<UserProfile>(["me"])?.id;
    const next = applyToList(list, event, myId);
    if (next.list !== list) queryClient.setQueryData(conversationsKey, next.list);
    if (next.refetch) void queryClient.invalidateQueries({ queryKey: conversationsKey });
  }

  if (event.type === "message.created") {
    const key = messagesKey(event.conversationId);
    const history = queryClient.getQueryData<History>(key);
    const next = applyToHistory(history, event);
    if (next.history !== history) queryClient.setQueryData(key, next.history);
    if (next.catchUp) void catchUpHistory(queryClient, event.conversationId);
  }
}

/** After a connection is (re)established: whatever was loaded before it may have missed events, so fetch what is missing. */
function catchUp(queryClient: QueryClient, attemptStartedAt: number) {
  void queryClient.invalidateQueries({
    queryKey: conversationsKey,
    predicate: (query) => query.state.dataUpdatedAt < attemptStartedAt,
  });
  queryClient
    .getQueryCache()
    .findAll({ queryKey: ["messages"] })
    .forEach((query) => {
      const conversationId = query.queryKey[1];
      if (typeof conversationId === "string") void catchUpHistory(queryClient, conversationId);
    });
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
      onConnected: (startedAt) => catchUp(queryClient, startedAt),
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
