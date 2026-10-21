"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useImageRecovery } from "./use-image-recovery";

/**
 * The picture at full size over the page, in the browser's own modal dialog: it keeps focus inside, closes on Escape
 * and gives focus back to what opened it. A click outside the picture, or the Close button, closes it too.
 */
export function ImageViewer({
  src,
  label,
  onClose,
  refresh,
}: {
  src: string;
  label: string;
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
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="m-auto max-h-dvh max-w-dvw bg-transparent p-4 backdrop:bg-ink/80"
    >
      <div className="flex flex-col items-end gap-2">
        <Button ref={closeButton} autoFocus onClick={onClose}>
          Close
        </Button>
        {picture.status === "failed" ? (
          <div role="status" className="flex min-h-40 min-w-60 flex-col items-center justify-center gap-2 bg-paper p-6 text-center text-ink">
            <p>Couldn&apos;t load image.</p>
            <Button
              variant="quiet"
              onClick={() => {
                picture.retry();
                closeButton.current?.focus(); // the Retry button goes away; focus stays inside the dialog
              }}
            >
              Retry<span className="sr-only"> loading the image</span>
            </Button>
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
            className="max-h-[80dvh] max-w-full bg-paper object-contain"
          />
        )}
      </div>
    </dialog>
  );
}
