import type { ReactNode } from "react";
import { ConversationsFrame } from "@/features/conversations/conversations-frame";

export default function ConversationsLayout({ children }: { children: ReactNode }) {
  return <ConversationsFrame>{children}</ConversationsFrame>;
}
