import { Client, ReconnectionTimeMode } from "@stomp/stompjs";

/** `connecting`: the first attempt. `reconnecting`: the connection was lost (or an attempt failed) and is being retried. */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

type Options = {
  /** The socket address (`ws://…/ws`). */
  url: string;
  /** The access token to present on every (re)connection: asked for each time, so a renewed token is always the one used. */
  getToken: () => Promise<string | undefined>;
  /** The body of each event frame. */
  onEvent: (body: string) => void;
  /** Called each time the connection is up and listening, with when that attempt began (what was loaded earlier may have missed events). */
  onConnected: (attemptStartedAt: number) => void;
};

/**
 * The STOMP connection to the backend, kept apart from React. It authenticates in the CONNECT frame, listens on the
 * person's own event queue and, whenever the connection is lost for any reason (network, the server closing it
 * because the token ran out), retries with a growing pause. Events are best effort, so the caller catches up after
 * every connection (`onConnected`) instead of trusting that nothing was missed.
 */
export function createConnection({ url, getToken, onEvent, onConnected }: Options) {
  let status: ConnectionStatus = "connecting";
  let attemptStartedAt = 0;
  let stopped = true;
  const listeners = new Set<() => void>();

  function setStatus(next: ConnectionStatus) {
    if (next === status) return;
    status = next;
    listeners.forEach((listener) => listener());
  }

  const client = new Client({
    brokerURL: url,
    reconnectDelay: 1_000,
    reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
    maxReconnectDelay: 15_000,
    heartbeatIncoming: 10_000,
    heartbeatOutgoing: 10_000,
    async beforeConnect(self) {
      attemptStartedAt = Date.now();
      const token = await getToken();
      self.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    },
    onConnect() {
      client.subscribe("/user/queue/events", (frame) => onEvent(frame.body));
      setStatus("connected");
      onConnected(attemptStartedAt);
    },
    onWebSocketClose() {
      if (!stopped) setStatus("reconnecting");
    },
  });

  return {
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start() {
      stopped = false;
      client.activate();
    },
    /** Closes the connection and stops retrying. */
    stop() {
      stopped = true;
      void client.deactivate();
    },
    /** Drops the current connection so it is opened again, with whatever token is current by then. */
    reopen() {
      client.forceDisconnect();
    },
  };
}

export type Connection = ReturnType<typeof createConnection>;
