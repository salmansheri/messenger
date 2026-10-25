import type { Metadata } from "next";
import { NewStoryForm } from "@/features/stories/new-story-form";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `New Story · ${APP_NAME}` };

// Not instant by design: see the comment in app/app/settings/page.tsx.
export const instant = false;

export default function NewStoryPage() {
  return <NewStoryForm />;
}
