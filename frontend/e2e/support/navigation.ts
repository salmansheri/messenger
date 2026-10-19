import type { Page } from "@playwright/test";

/** The list of Conversations. */
export const index = (page: Page) => page.getByRole("navigation", { name: "Conversations" });

/** One Conversation's entry in the list. */
export const rowFor = (page: Page, id: string) => index(page).locator(`a[href="/app/c/${id}"]`);

/** On a phone the list is its own screen: go back to it from an open Conversation (a desktop shows it already). */
export async function showIndex(page: Page) {
  const back = page.getByRole("link", { name: "Conversations", exact: true });
  if (await back.isVisible()) await back.click();
}
