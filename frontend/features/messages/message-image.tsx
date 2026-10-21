"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageViewer } from "./image-viewer";
import type { TimelineImage } from "./timeline";
import { useImageRecovery } from "./use-image-recovery";

/** The widest a thumbnail is shown. */
const MAX_WIDTH = "20rem";

/**
 * The picture sent with a Message, at the server's thumbnail size, as a button that opens it full size. Its room is
 * reserved from the size the server gave (or the one measured on this device while it is being sent), so the history
 * does not jump when it loads. A link that has run out is replaced by fresh ones without the person noticing; only if
 * that does not help does a placeholder with Retry stand in its place. `label` names it for assistive technology.
 */
export function MessageImage({
  image,
  label,
  refresh,
}: {
  image: TimelineImage;
  label: string;
  /** Fetches fresh links (not for a preview held on this device). */
  refresh?: () => Promise<void>;
}) {
  const known = image.width && image.height;
  const box = known
    ? { aspectRatio: `${image.width} / ${image.height}`, maxWidth: `min(${MAX_WIDTH}, ${image.width}px)` }
    : { maxWidth: MAX_WIDTH };
  const picture = useImageRecovery(image.src, refresh);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  // Retry is pressed on a placeholder that is replaced by the picture; focus goes to the picture's button, not to the page.
  const retried = useRef(false);
  useEffect(() => {
    if (retried.current && picture.status !== "failed") {
      retried.current = false;
      opener.current?.focus();
    }
  }, [picture.status]);

  if (picture.status === "failed") {
    return (
      <div
        role="status"
        style={box}
        className="my-1 flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-sm border border-rule bg-band p-3 text-center text-sm text-ink-muted"
      >
        <p>Couldn&apos;t load image.</p>
        <Button
          variant="quiet"
          onClick={() => {
            retried.current = true;
            picture.retry();
          }}
        >
          Retry<span className="sr-only"> loading {label}</span>
        </Button>
      </div>
    );
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        style={box}
        className="my-1 block w-full cursor-zoom-in rounded-sm"
      >
        {/* The button carries the name; the links are signed and short-lived, so the browser loads them directly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={picture.attempt}
          src={image.src}
          alt=""
          loading="lazy"
          decoding="async"
          width={image.width}
          height={image.height}
          onLoad={picture.onLoad}
          onError={picture.onError}
          style={known ? { aspectRatio: `${image.width} / ${image.height}` } : undefined}
          className="block h-auto w-full rounded-sm border border-rule bg-band object-cover"
        />
      </button>
      {open && (
        <ImageViewer
          src={image.fullSrc}
          label={label}
          refresh={refresh}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}
