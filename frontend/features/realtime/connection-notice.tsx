"use client";

import { useConnectionStatus } from "./realtime-provider";

/** A quiet note, in the header, while the live connection is down. The region is always there so the change is announced. */
export function ConnectionNotice() {
  const status = useConnectionStatus();
  return (
    <p role="status" data-connection={status} className="font-mono text-xs text-ink-muted">
      {status === "reconnecting" ? "Reconnecting…" : ""}
    </p>
  );
}
