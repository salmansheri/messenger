import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Checks the screen that is showing against WCAG 2.1 A and AA and axe's best practices, in whatever theme and width the
 * test runs in (the projects cover light and dark, desktop and phone), and checks that no word of the interface says
 * "chat" or "contact" (the glossary's words are Conversation, Group, Participant and last seen).
 */
export async function expectAccessible(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .exclude("nextjs-portal") // the development overlay is not part of the app
    .analyze();
  const found = results.violations.map((violation) => {
    const first = violation.nodes[0];
    return `${violation.id} (${violation.nodes.length}): ${violation.help}; first: ${first.target.join(" ")} ${first.failureSummary?.split("\n")[1] ?? ""}`.trim();
  });
  expect(found, `${screen} has accessibility problems`).toEqual([]);

  const words = await page.evaluate(() => {
    const attributes = [...document.querySelectorAll("[aria-label],[title],[placeholder],[alt]")].flatMap((element) =>
      ["aria-label", "title", "placeholder", "alt"].map((name) => element.getAttribute(name) ?? ""),
    );
    return [document.body.innerText, ...attributes].join("\n");
  });
  expect(words.match(/\b(chat|contact)s?\b/gi) ?? [], `${screen} uses a word the glossary rules out`).toEqual([]);
}
