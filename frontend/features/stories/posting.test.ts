import { describe, expect, it } from "vitest";
import { ApiProblem } from "@/lib/api/problem";
import { STORY_TONES, captionSchema, storyFailureMessage, storyTextSchema } from "./posting";

const problem = (status: number, detail?: string, retryAfterSeconds?: number) =>
  new ApiProblem(status, "Problem", detail, {}, retryAfterSeconds);

describe("storyTextSchema", () => {
  it("takes up to 700 characters, counting an emoji as one, without the spaces around them", () => {
    expect(storyTextSchema.parse("  Off to the Engine  ")).toBe("Off to the Engine");
    expect(storyTextSchema.safeParse("😀".repeat(700)).success).toBe(true);
    expect(storyTextSchema.safeParse("😀".repeat(701)).error?.issues[0].message).toBe("Use at most 700 characters.");
  });

  it("needs some text and refuses a NUL", () => {
    expect(storyTextSchema.safeParse("   ").error?.issues[0].message).toBe("Write something for your Story.");
    expect(storyTextSchema.safeParse("a\u0000b").error?.issues[0].message).toBe("Remove the special character.");
  });
});

describe("captionSchema", () => {
  it("is optional: nothing or only spaces is no caption", () => {
    expect(captionSchema.parse("")).toBeUndefined();
    expect(captionSchema.parse("   ")).toBeUndefined();
    expect(captionSchema.parse(" At Bletchley ")).toBe("At Bletchley");
  });

  it("follows the same rules as a text Story when there is one", () => {
    expect(captionSchema.safeParse("x".repeat(701)).error?.issues[0].message).toBe("Use at most 700 characters.");
  });
});

describe("STORY_TONES", () => {
  it("are the six Avatar tones, as the server names them", () => {
    expect(STORY_TONES).toEqual(["CLAY", "OCHRE", "MOSS", "SEA", "SLATE", "PLUM"]);
  });
});

describe("storyFailureMessage", () => {
  it("passes on the cap on live Stories in the server's words", () => {
    expect(storyFailureMessage(problem(409, "You can have at most 30 live Stories."), "post")).toBe("You can have at most 30 live Stories.");
  });

  it("says how long to wait after posting too often", () => {
    expect(storyFailureMessage(problem(429, undefined, 1800), "post")).toBe("You have posted too many Stories. Try again in 30 minutes.");
    expect(storyFailureMessage(problem(429), "post")).toBe("You have posted too many Stories. Try again later.");
  });

  it("words an upload refusal like other images", () => {
    expect(storyFailureMessage(problem(413), "upload")).toBe("That image is larger than 10 MB.");
    expect(storyFailureMessage(problem(400, "The image is too large in pixels."), "upload")).toBe("The image is too large in pixels.");
    expect(storyFailureMessage(problem(429, undefined, 40), "upload")).toBe("You have sent too many images. Try again in a moment.");
  });

  it("asks for the photo again when the upload can no longer be used", () => {
    expect(storyFailureMessage(problem(404, "Attachment not found."), "post")).toBe("That photo can no longer be used. Choose it again.");
  });

  it("falls back to the general wording", () => {
    expect(storyFailureMessage(problem(503), "post")).toBe("The server is busy. Try again in a moment.");
  });
});
