import type { Metadata } from "next";
import { StartDirectForm } from "@/features/conversations/start-direct-form";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `New Conversation · ${APP_NAME}` };

// Not instant by design: see the comment in app/app/(conversations)/page.tsx.
export const instant = false;

export default function NewConversationPage() {
  return <StartDirectForm />;
}
