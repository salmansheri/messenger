"use client";

import { useState } from "react";
import { useImageRecovery } from "@/features/messages/use-image-recovery";
import { heldLink, initialsOf, toneOf, type AvatarTone } from "./avatar";
import { useProfileRefresh } from "./use-profile-refresh";

const SIZES = {
  xs: "size-5 text-[0.55rem]",
  sm: "size-7 text-[0.7rem]",
  md: "size-10 text-sm",
  lg: "size-24 text-2xl",
} as const;

// Whole class names, so Tailwind finds them.
const TONES: Record<AvatarTone, string> = {
  clay: "bg-tone-clay",
  ochre: "bg-tone-ochre",
  moss: "bg-tone-moss",
  sea: "bg-tone-sea",
  slate: "bg-tone-slate",
  plum: "bg-tone-plum",
};

/**
 * A person's Avatar as a disc, or their initials on a tone picked from their id when they have none. It is always next
 * to their name, so it is decorative (the name says who it is): `alt=""` and hidden initials. A picture that will not
 * load (most often a link that ran out) asks once for fresh links; if that does not help, the initials stand in until
 * a different link arrives. The link already shown is kept while it is good (`heldLink`), so the fresh addresses of
 * every list refetch do not download the same picture again. `id` and `name` may also be a Group's, which has no
 * picture.
 */
export function Avatar({ id, name, url, size = "md" }: { id: string | undefined; name: string | undefined; url?: string; size?: keyof typeof SIZES }) {
  const refresh = useProfileRefresh();
  const [held, setHeld] = useState(url);
  const [failed, setFailed] = useState<string>();
  // Reconsidered only when a fresh link arrives or the held one fails (React's "adjust state while rendering").
  const [seen, setSeen] = useState({ url, failed });
  if (seen.url !== url || seen.failed !== failed) {
    setSeen({ url, failed });
    setHeld(heldLink(held, url, failed));
  }
  const picture = useImageRecovery(held ?? "", held ? refresh : undefined);
  const shown = held && picture.status === "showing";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-ink select-none ${SIZES[size]} ${shown ? "bg-surface" : TONES[toneOf(id)]}`}
    >
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed link to our own file endpoint, not an optimisable asset
        <img
          key={picture.attempt}
          src={held}
          alt=""
          className="size-full object-cover"
          onLoad={picture.onLoad}
          onError={() => {
            setFailed(held); // a link that failed is not kept, whatever its expiry says
            picture.onError();
          }}
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
