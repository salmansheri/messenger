"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { removeAvatarMutation, setAvatarMutation, toProblem } from "@/lib/api";
import { ACCEPT, chooseImage } from "@/features/messages/image-file";
import { Avatar } from "@/features/people/person-avatar";
import { recordProfile } from "@/features/realtime/sync";
import { avatarFailureMessage } from "./wording";

type Chosen = { file: File; previewUrl: string };

/**
 * The person's Avatar: what they have now (or their initials), a way to choose a picture, see it as it will be cut (the
 * middle square, which is what the server keeps) and save it, and a way to remove it. The file is checked here first
 * (type and size, as for images in Messages) so a pointless upload is not made; the server decides by decoding it. A
 * change reaches everyone who shares a Conversation with the person, and this screen's own list, through
 * `recordProfile`, the same as the event for it.
 */
export function AvatarChooser({ userId, name, url }: { userId: string; name: string | undefined; url: string | undefined }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState<Chosen>();
  const [problem, setProblem] = useState<string>();
  const [notice, setNotice] = useState("");

  // The preview's address is the browser's, held until the picture is saved, put back or the screen goes.
  useEffect(() => {
    if (!chosen) return;
    return () => URL.revokeObjectURL(chosen.previewUrl);
  }, [chosen]);

  // The buttons pressed to get here go away, so focus follows to what comes next: Save after choosing, Choose after
  // saving, putting back or removing.
  const hadChosen = useRef(false);
  useEffect(() => {
    if (chosen && !hadChosen.current) saveButton.current?.focus();
    if (!chosen && hadChosen.current) chooseButton.current?.focus();
    hadChosen.current = Boolean(chosen);
  }, [chosen]);

  const save = useMutation({
    ...setAvatarMutation(),
    onMutate: () => {
      setProblem(undefined);
      setNotice("");
    },
    onSuccess: (profile) => {
      recordProfile(queryClient, userId, { avatarUrl: profile.avatarUrl ?? null });
      setChosen(undefined);
      setNotice("Avatar saved.");
    },
    onError: (error) => setProblem(avatarFailureMessage(toProblem(error))),
  });

  const remove = useMutation({
    ...removeAvatarMutation(),
    onMutate: () => {
      setProblem(undefined);
      setNotice("");
    },
    onSuccess: () => {
      recordProfile(queryClient, userId, { avatarUrl: null });
      setNotice("Avatar removed.");
      chooseButton.current?.focus(); // the Remove button that had focus is gone
    },
    onError: (error) => setProblem(avatarFailureMessage(toProblem(error))),
  });

  function choose(files: FileList | null) {
    const found = chooseImage(files);
    setNotice("");
    if (found.kind === "none") return;
    if (found.kind === "refused") {
      setProblem(found.message);
      return;
    }
    setProblem(undefined);
    setChosen({ file: found.file, previewUrl: URL.createObjectURL(found.file) });
  }

  const busy = save.isPending || remove.isPending;
  return (
    <div className="mt-3 flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        A square picture shown next to your name to everyone you share a Conversation with. Without one, your initials are shown.
      </p>
      <div className="flex flex-wrap items-center gap-6">
        {chosen ? (
          // eslint-disable-next-line @next/next/no-img-element -- a picture held in this browser, not a file the server serves
          <img
            src={chosen.previewUrl}
            alt="Your new Avatar, cut to the square that will be kept"
            className="size-24 rounded-sm border border-rule object-cover"
          />
        ) : (
          <>
            <Avatar id={userId} name={name} url={url} size="lg" />
            {/* The disc is decorative elsewhere, beside a name; here it is the subject, so say what it shows. */}
            <span className="sr-only">{url ? "You have an Avatar." : "You have no Avatar, so your initials are shown."}</span>
          </>
        )}
        <div className="flex flex-wrap items-center gap-4">
          {chosen ? (
            <>
              <Button ref={saveButton} busy={busy} onClick={() => save.mutate({ body: { file: chosen.file } })}>
                {save.isPending ? "Saving…" : "Save Avatar"}
              </Button>
              <Button variant="quiet" busy={busy} onClick={() => setChosen(undefined)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button ref={chooseButton} busy={busy} onClick={() => input.current?.click()}>
                {url ? "Choose a new picture" : "Choose a picture"}
              </Button>
              {url && (
                <Button variant="quiet" busy={busy} onClick={() => remove.mutate({})}>
                  {remove.isPending ? "Removing…" : "Remove Avatar"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {chosen && <p className="text-sm text-ink-muted">The middle square of the picture is kept, at 256 by 256 pixels.</p>}
      {problem && <Notice tone="problem">{problem}</Notice>}
      <p role="status" className="text-sm text-ink-muted">
        {notice}
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files);
          event.target.value = ""; // the same file can be chosen again after Cancel
        }}
      />
    </div>
  );
}
