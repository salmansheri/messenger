import type { Metadata } from "next";
import { CreateGroupForm } from "@/features/groups/create-group-form";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `New Group · ${APP_NAME}` };

// Not instant by design: see the comment in app/app/(conversations)/page.tsx.
export const instant = false;

export default function NewGroupPage() {
  return <CreateGroupForm />;
}
