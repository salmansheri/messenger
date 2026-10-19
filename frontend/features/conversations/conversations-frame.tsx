"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ConversationIndex } from "./conversation-index";

/**
 * The Conversation index and the open Conversation (or the "start one" screen) side by side on a desktop. On a phone
 * they are separate screens told apart by the address: `/app` is the index, anything below it is the other side, which
 * has its own way back.
 */
export function ConversationsFrame({ children }: { children: ReactNode }) {
  const route = usePathname() === "/app" ? "index" : "detail";
  return (
    <div data-route={route} className="group grid min-h-0 flex-1 md:grid-cols-[20rem_1fr]">
      <div className="min-h-0 min-w-0 overflow-y-auto border-rule group-data-[route=detail]:max-md:hidden md:border-r">
        <ConversationIndex />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col group-data-[route=index]:max-md:hidden">{children}</div>
    </div>
  );
}
