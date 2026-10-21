import type { TimelineImage } from "./timeline";

/** The widest a thumbnail is shown. */
const MAX_WIDTH = "20rem";

/**
 * The picture sent with a Message, at the server's thumbnail size. Its room is reserved from the size the server gave
 * (or the one measured on this device while it is being sent), so the history does not jump when it loads.
 */
export function MessageImage({ image, label }: { image: TimelineImage; label: string }) {
  const known = image.width && image.height;
  return (
    // The links are signed and short-lived, so the browser loads them directly (no image optimiser in between).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      alt={label}
      loading="lazy"
      decoding="async"
      width={image.width}
      height={image.height}
      style={known ? { aspectRatio: `${image.width} / ${image.height}`, maxWidth: `min(${MAX_WIDTH}, ${image.width}px)` } : { maxWidth: MAX_WIDTH }}
      className="my-1 block h-auto w-full rounded-sm border border-rule bg-band object-cover"
    />
  );
}
