import { describe, expect, it } from "vitest";
import { availabilityNotice, presenceText, typingText } from "./text";

const NOW = new Date("2026-03-10T12:00:00Z");

describe("presenceText", () => {
  it("says online", () => {
    expect(presenceText({ userId: "u", online: true }, NOW, "UTC")).toBe("Online");
  });

  it("says when someone was last seen: today, yesterday, then the date", () => {
    const seen = (lastSeenAt: string) => presenceText({ userId: "u", online: false, lastSeenAt }, NOW, "UTC");
    expect(seen("2026-03-10T09:05:00Z")).toBe("Last seen today at 09:05");
    expect(seen("2026-03-09T23:59:00Z")).toBe("Last seen yesterday at 23:59");
    expect(seen("2026-03-01T10:00:00Z")).toBe("Last seen Sun 1 Mar at 10:00");
  });

  it("uses the viewer's time zone", () => {
    expect(presenceText({ userId: "u", online: false, lastSeenAt: "2026-03-09T23:30:00Z" }, NOW, "Asia/Kolkata")).toBe(
      "Last seen today at 05:00",
    );
  });

  it("says offline for someone who has never been seen, and nothing when it is not known yet", () => {
    expect(presenceText({ userId: "u", online: false }, NOW, "UTC")).toBe("Offline");
    expect(presenceText(undefined, NOW, "UTC")).toBe("");
  });
});

describe("presenceText with Availability", () => {
  it("puts Busy or Away before where someone is, online or not", () => {
    expect(presenceText({ userId: "u", online: true, availability: "BUSY" }, NOW, "UTC")).toBe("Busy · Online");
    expect(presenceText({ userId: "u", online: false, lastSeenAt: "2026-03-10T09:05:00Z", availability: "AWAY" }, NOW, "UTC")).toBe(
      "Away · Last seen today at 09:05",
    );
  });

  it("adds nothing for someone who is available", () => {
    expect(presenceText({ userId: "u", online: true, availability: "AVAILABLE" }, NOW, "UTC")).toBe("Online");
  });
});

describe("availabilityNotice", () => {
  it("says the other person is busy or away", () => {
    expect(availabilityNotice("Grace", "BUSY")).toBe("Grace is busy.");
    expect(availabilityNotice("Grace", "AWAY")).toBe("Grace is away.");
  });

  it("says nothing for someone who is available, or whose Availability is not known", () => {
    expect(availabilityNotice("Grace", "AVAILABLE")).toBe("");
    expect(availabilityNotice("Grace", undefined)).toBe("");
  });
});

describe("typingText", () => {
  it("names one, two, or one and a count of the rest", () => {
    expect(typingText([])).toBe("");
    expect(typingText(["Ada"])).toBe("Ada is typing…");
    expect(typingText(["Ada", "Grace"])).toBe("Ada and Grace are typing…");
    expect(typingText(["Ada", "Grace", "Linus"])).toBe("Ada and 2 others are typing…");
    expect(typingText(["Ada", "Grace", "Linus", "Alan", "Edsger"])).toBe("Ada and 4 others are typing…");
  });
});
