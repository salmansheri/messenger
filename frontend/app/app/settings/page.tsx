import type { Metadata } from "next";
import { SettingsView } from "@/features/session/settings-view";
import { APP_NAME } from "@/lib/app-name";

export const metadata: Metadata = { title: `Settings · ${APP_NAME}` };

// Not instant by design: RequireSession (in the layout) renders nothing until the browser knows the session, because the
// access token lives only in memory (docs/adr/0003). Next's instant-navigation check would otherwise report this page
// as "dropped from rendering".
export const instant = false;

export default function SettingsPage() {
  return <SettingsView />;
}
