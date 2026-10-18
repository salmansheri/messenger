import { describe, expect, it } from "vitest";
import { afterSignInPath, signInPathFor } from "./safe-next";

describe("afterSignInPath", () => {
  it("goes back to a page inside the signed-in app", () => {
    expect(afterSignInPath("/app/settings")).toBe("/app/settings");
    expect(afterSignInPath("/app/c/123?x=1#top")).toBe("/app/c/123?x=1#top");
    expect(afterSignInPath("/app")).toBe("/app");
  });

  it("falls back to the app for anything that is not a path inside it", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "https://evil.example/app",
      "//evil.example/app",
      "/\\evil.example",
      "/sign-in",
      "/application",
      "app/settings",
      "javascript:alert(1)",
      "/app/../sign-in",
      "/app\n/x",
    ]) {
      expect(afterSignInPath(bad), String(bad)).toBe("/app");
    }
  });
});

describe("signInPathFor", () => {
  it("remembers where the visitor was going", () => {
    expect(signInPathFor("/app/settings")).toBe("/sign-in?next=%2Fapp%2Fsettings");
  });
});
