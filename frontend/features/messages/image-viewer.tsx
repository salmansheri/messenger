"use client";

import { useEffect, useRef } from "react";
import { useImageRecovery } from "./use-image-recovery";

/**
 * The picture at full size over the page, in the browser's own modal dialog: it keeps focus inside, closes on Escape
 * and gives focus back to what opened it. Dark glass fills the screen (the page behind it blurred, in every theme; the
 * glass is a layer inside the dialog, because the blur of the dialog's own backdrop is not reliable), the picture sits in
 * the middle with its caption beneath, and a round Close button is in the corner. A click anywhere outside the
 * picture closes it too.
 */
export function ImageViewer({
  src,
  label,
  caption,
  onClose,
  refresh,
}: {
  src: string;
  label: string;
  /** The Message's own text, shown under the picture. */
  caption?: string;
  onClose: () => void;
  refresh?: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const picture = useImageRecovery(src, refresh);

  // Opened once. Nothing closes it on cleanup: removing the element closes it, and closing it here would fire a
  // `close` event that (when React runs effects twice in development) made it vanish at once.
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onClose={onClose}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 text-on-scrim backdrop:bg-transparent"
    >
      <div
        onClick={(event) => event.target === event.currentTarget && onClose()}
        className="viewer-fade relative flex h-full w-full items-center justify-center bg-scrim/70 p-4 backdrop-blur-2xl backdrop-saturate-150 sm:p-10"
      >
        <button
          ref={closeButton}
          type="button"
          autoFocus
          aria-label="Close"
          title="Close"
          onClick={onClose}
          className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-on-scrim/15 text-on-scrim transition-colors hover:bg-on-scrim/25 sm:top-6 sm:right-6"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <figure className="viewer-in flex max-h-full max-w-full flex-col items-center gap-4">
          {picture.status === "failed" ? (
            <div role="status" className="flex min-h-40 min-w-64 flex-col items-center justify-center gap-3 rounded-xl bg-on-scrim/10 p-8 text-center">
              <p>Couldn&apos;t load image.</p>
              <button
                type="button"
                className="rounded-full bg-on-scrim px-5 py-2 text-sm font-medium text-scrim hover:opacity-90"
                onClick={() => {
                  picture.retry();
                  closeButton.current?.focus(); // the Retry button goes away; focus stays inside the dialog
                }}
              >
                Retry<span className="sr-only"> loading the image</span>
              </button>
            </div>
          ) : (
            // The dialog already carries the name; the picture itself adds nothing for a screen reader.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={picture.attempt}
              src={src}
              alt=""
              onLoad={picture.onLoad}
              onError={picture.onError}
              className="max-h-[78dvh] max-w-full rounded-xl object-contain shadow-2xl ring-1 ring-on-scrim/10"
            />
          )}
          {caption && picture.status !== "failed" && (
            <figcaption className="max-w-prose text-center text-sm leading-relaxed break-words whitespace-pre-wrap text-on-scrim/85 [overflow-wrap:anywhere]">
              {caption}
            </figcaption>
          )}
        </figure>
      </div>
    </dialog>
  );
}
