import type { Metadata } from "next";
import { SettingsView } from "@/features/session/settings-view";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Settings · ${APP_NAME}` };

export default function SettingsPage() {
  return <SettingsView />;
}
