import { z } from "zod";
import type { ApiProblem } from "@/lib/api/problem";
import type { StoryResponse } from "@/lib/api";
import type { AvatarTone } from "@/features/people/avatar";
import { TONES } from "@/features/people/person-avatar";
import { messageFor, whenToRetry } from "@/lib/api/messages";

/** The most a Story's text or a photo's caption may hold, counted as the server counts (Unicode code points). */
export const STORY_TEXT_MAX = 700;

/** Characters as the server counts them (Unicode code points), so an emoji is one. */
export const codePoints = (value: string) => [...value].length;

/** The tones a text Story can be drawn on: the Avatar tones, named as the server names them. */
export const STORY_TONES = ["CLAY", "OCHRE", "MOSS", "SEA", "SLATE", "PLUM"] as const satisfies readonly NonNullable<StoryResponse["tone"]>[];
export type StoryTone = (typeof STORY_TONES)[number];

/** The background class of a tone: the Avatar tone tokens, never a hard-coded colour. */
export const toneClass = (tone: StoryTone) => TONES[tone.toLowerCase() as AvatarTone];

/** The text of a text Story: the server's rules (not blank, at most 700 characters, no NUL), without outer spaces. */
export const storyTextSchema = z
  .string()
  .trim()
  .min(1, "Write something for your Story.")
  .refine((text) => codePoints(text) <= STORY_TEXT_MAX, `Use at most ${STORY_TEXT_MAX} characters.`)
  .refine((text) => !text.includes("\u0000"), "Remove the special character.");

/** A photo's caption: optional (nothing, or only spaces, is no caption), otherwise the same rules as a text Story. */
export const captionSchema = z
  .string()
  .trim()
  .transform((caption) => (caption.length === 0 ? undefined : caption))
  .refine((caption) => caption === undefined || codePoints(caption) <= STORY_TEXT_MAX, `Use at most ${STORY_TEXT_MAX} characters.`)
  .refine((caption) => caption === undefined || !caption.includes("\u0000"), "Remove the special character.");

/**
 * Why sharing a Story failed, in plain words: `upload` is the photo's upload, `post` the Story itself. The cap on live
 * Stories is the server's own sentence; posting or uploading too often says how long to wait.
 */
export function storyFailureMessage(problem: ApiProblem, step: "upload" | "post"): string {
  if (step === "upload") {
    if (problem.status === 429) return `You have sent too many images. Try again ${whenToRetry(problem)}.`;
    if (problem.status === 413) return "That image is larger than 10 MB.";
    if (problem.status === 400) return problem.detail || "That picture could not be used. Choose a PNG, JPEG, WebP or GIF image.";
    return messageFor(problem);
  }
  if (problem.status === 409) return problem.detail || "You have too many live Stories.";
  if (problem.status === 429) return `You have posted too many Stories. Try again ${whenToRetry(problem)}.`;
  if (problem.status === 404) return "That photo can no longer be used. Choose it again.";
  return messageFor(problem);
}
