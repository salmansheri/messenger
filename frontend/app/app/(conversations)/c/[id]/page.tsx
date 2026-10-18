import type { Metadata } from "next";
import { ConversationPane } from "@/features/conversations/conversation-pane";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Conversation · ${APP_NAME}` };

// Not instant by design: see the comment in app/app/(conversations)/page.tsx.
export const instant = false;

export default function ConversationPage() {
  return <ConversationPane />;
}
