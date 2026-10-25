"use client";

import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { sdk, toProblem, type StoryResponse } from "@/lib/api";
import { ApiProblem } from "@/lib/api/problem";
import { submitHandler, useFormElement } from "@/lib/forms/form-helpers";
import { shownError } from "@/features/auth/server-problems";
import { ACCEPT, chooseImage } from "@/features/messages/image-file";
import { recordStoryEvent } from "@/features/realtime/sync";
import { useMe } from "@/features/session/use-me";
import { STORY_TEXT_MAX, STORY_TONES, captionSchema, codePoints, storyFailureMessage, storyTextSchema, toneClass, type StoryTone } from "./posting";

type Kind = "PHOTO" | "TEXT";
type Share = { kind: "PHOTO"; file: File; caption: string | undefined } | { kind: "TEXT"; text: string; tone: StoryTone };

/** Which step of sharing failed, so the failure can be worded for it. */
class ShareFailure extends Error {
  constructor(
    readonly step: "upload" | "post",
    readonly problem: ApiProblem,
  ) {
    super(problem.message);
  }
}

const toneName = (tone: StoryTone) => tone.charAt(0) + tone.slice(1).toLowerCase();

/**
 * Posting a Story: a photo (picked, pasted or dropped, with the composer's checks, shown before it is shared) with an
 * optional caption, or a text on one of six tones. Share uploads the photo, then posts; a failure is worded in place;
 * on success the Story is put into the tray and the screen goes back to the list.
 */
export function NewStoryForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [kind, setKind] = useState<Kind>("PHOTO");
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string }>();
  const [photoProblem, setPhotoProblem] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const { ref: formElement, focusFirstInvalid } = useFormElement();

  // The preview's address is given back when it is replaced or the screen goes.
  const previewUrl = photo?.previewUrl;
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function choose(files: ArrayLike<File> | null | undefined): boolean {
    const chosen = chooseImage(files);
    if (chosen.kind === "none") return false;
    if (chosen.kind === "refused") {
      setPhotoProblem(chosen.message);
      return true;
    }
    setPhoto({ file: chosen.file, previewUrl: URL.createObjectURL(chosen.file) });
    setPhotoProblem(undefined);
    share.reset();
    return true;
  }

  // The upload of the photo chosen, kept so that pressing Share again after the post failed does not upload it again
  // (which would spend the upload allowance and leave the first one for the sweep).
  const uploaded = useRef<{ file: File; id: string }>(undefined);
  const share = useMutation<StoryResponse, ShareFailure, Share>({
    mutationFn: async (story) => {
      let attachmentId: string | undefined;
      if (story.kind === "PHOTO") {
        if (uploaded.current?.file === story.file) attachmentId = uploaded.current.id;
        else {
          try {
            attachmentId = (await sdk.upload({ body: { file: story.file } })).data?.id;
          } catch (error) {
            throw new ShareFailure("upload", toProblem(error));
          }
          if (!attachmentId) throw new ShareFailure("upload", new ApiProblem(500, "No upload", undefined, {}, undefined));
          uploaded.current = { file: story.file, id: attachmentId };
        }
      }
      try {
        const body = story.kind === "PHOTO" ? { kind: "PHOTO" as const, attachmentId, text: story.caption } : { kind: "TEXT" as const, text: story.text, tone: story.tone };
        return (await sdk.post({ body })).data as StoryResponse;
      } catch (error) {
        const problem = toProblem(error);
        if (problem.status === 404) uploaded.current = undefined; // that upload can no longer be used
        throw new ShareFailure("post", problem);
      }
    },
    onSuccess: (story) => {
      const userId = me.data?.id;
      if (userId) {
        recordStoryEvent(queryClient, {
          type: "story.posted",
          story,
          poster: { userId, displayName: me.data?.displayName, avatarUrl: me.data?.avatarUrl },
        });
      }
      router.push("/app");
    },
  });

  const form = useForm({
    defaultValues: { caption: "", text: "", tone: "SEA" as StoryTone },
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: ({ value }) => {
      if (kind === "PHOTO") {
        if (!photo) {
          setPhotoProblem("Choose a photo to share.");
          chooseButton.current?.focus();
          return undefined;
        }
        return share.mutateAsync({ kind: "PHOTO", file: photo.file, caption: captionSchema.parse(value.caption) }).catch(() => undefined);
      }
      return share.mutateAsync({ kind: "TEXT", text: storyTextSchema.parse(value.text), tone: value.tone }).catch(() => undefined);
    },
  });

  function paste(event: ClipboardEvent) {
    // As in the composer: only files with no text alongside them; pasting text into the caption goes on as usual.
    if (kind !== "PHOTO" || event.clipboardData.getData("text/plain")) return;
    if (choose(event.clipboardData.files)) event.preventDefault();
  }

  function dragOver(event: DragEvent) {
    if (kind !== "PHOTO" || ![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  }

  function drop(event: DragEvent) {
    if (kind !== "PHOTO" || ![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  }

  const failure = share.error ? storyFailureMessage(share.error.problem, share.error.step) : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <Link href="/app" className="text-sm text-ink-muted underline underline-offset-4 decoration-rule hover:text-ink">
        ← Conversations
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight">New Story</h1>
      <p className="mt-2 text-ink-muted">Everyone you have a Direct conversation with can see it for 24 hours.</p>

      <form ref={formElement} onSubmit={submitHandler(form)} onPaste={paste} noValidate className="mt-8 flex flex-col gap-6">
        <fieldset className="flex gap-2">
          <legend className="sr-only">Kind of Story</legend>
          {(["PHOTO", "TEXT"] as const).map((option) => (
            <label key={option} className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-accent ${kind === option ? "border-ink bg-ink text-paper" : "border-rule text-ink-muted hover:text-ink"}`}>
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => {
                  setKind(option);
                  share.reset();
                }}
                className="sr-only"
              />
              {option === "PHOTO" ? "Photo" : "Text"}
            </label>
          ))}
        </fieldset>

        {kind === "PHOTO" ? (
          <>
            <div
              onDragOver={dragOver}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
              className={`flex flex-col items-center gap-4 rounded-sm border border-dashed p-6 text-center ${dragging ? "border-accent bg-band" : "border-rule"}`}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a preview of a file on this device
                <img src={photo.previewUrl} alt="The photo you chose" className="max-h-80 rounded-sm object-contain" />
              ) : (
                <p className="text-ink-muted">Choose a photo, paste one, or drop it here.</p>
              )}
              <Button ref={chooseButton} variant="quiet" onClick={() => picker.current?.click()} aria-describedby={photoProblem ? "photo-problem" : undefined}>
                {photo ? "Choose another photo" : "Choose a photo"}
              </Button>
              <input
                ref={picker}
                type="file"
                accept={ACCEPT}
                tabIndex={-1}
                aria-hidden
                className="hidden"
                onChange={(event) => {
                  choose(event.target.files);
                  event.target.value = ""; // so the same file can be chosen again
                }}
              />
              {photoProblem && (
                <p id="photo-problem" role="alert" className="text-sm text-accent">
                  {photoProblem}
                </p>
              )}
            </div>
            <form.Field name="caption" validators={{ onDynamic: captionSchema }}>
              {(field) => (
                <TextBox
                  label="Caption (optional)"
                  name={field.name}
                  value={field.state.value}
                  rows={2}
                  onBlur={field.handleBlur}
                  onChange={(value) => {
                    field.handleChange(value);
                    share.reset();
                  }}
                  error={shownError(field.state.meta)}
                />
              )}
            </form.Field>
          </>
        ) : (
          <>
            <form.Field name="text" validators={{ onDynamic: storyTextSchema }}>
              {(field) => (
                <TextBox
                  label="Your Story"
                  name={field.name}
                  value={field.state.value}
                  rows={5}
                  onBlur={field.handleBlur}
                  onChange={(value) => {
                    field.handleChange(value);
                    share.reset();
                  }}
                  error={shownError(field.state.meta)}
                />
              )}
            </form.Field>
            <form.Field name="tone">
              {(field) => (
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">Background</legend>
                  <div className="flex flex-wrap gap-3">
                    {STORY_TONES.map((tone) => (
                      <label key={tone} className="flex cursor-pointer flex-col items-center gap-1 text-xs text-ink-muted has-checked:text-ink">
                        <input
                          type="radio"
                          name={field.name}
                          value={tone}
                          checked={field.state.value === tone}
                          onChange={() => field.handleChange(tone)}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden
                          className={`size-10 rounded-full ring-offset-2 ring-offset-paper peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent ${toneClass(tone)}`}
                        />
                        {toneName(tone)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => [state.values.text, state.values.tone] as const}>
              {([text, tone]) => (
                <div aria-hidden className={`flex min-h-40 items-center justify-center rounded-sm p-6 text-ink ${toneClass(tone)}`}>
                  <p className="text-center font-serif text-xl break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{text.trim() || "Your words, on this colour."}</p>
                </div>
              )}
            </form.Subscribe>
          </>
        )}

        {failure && <Notice tone="problem">{failure}</Notice>}
        <div>
          <Button type="submit" busy={share.isPending}>
            {share.isPending ? "Sharing…" : "Share"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** A labelled text box with the count of characters used and the reason it is refused, if it is. */
function TextBox({
  label,
  name,
  value,
  rows,
  onBlur,
  onChange,
  error,
}: {
  label: string;
  name: string;
  value: string;
  rows: number;
  onBlur: () => void;
  onChange: (value: string) => void;
  error: string | undefined;
}) {
  const id = `story-${name}`;
  const count = codePoints(value.trim());
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-message`}
        className={`w-full resize-y rounded-sm border bg-surface px-3 py-2.5 text-base text-ink ${error ? "border-accent" : "border-rule"}`}
      />
      <p id={`${id}-message`} className={`text-sm ${error ? "text-accent" : "text-ink-muted"}`}>
        {error ?? (
          <span className="font-mono">
            {count} / {STORY_TEXT_MAX}
          </span>
        )}
      </p>
    </div>
  );
}
