"use client";

import { useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { emailSchema } from "@/features/auth/schemas";

/**
 * "Add a person by email": a box and an Add button (Enter adds too, and never submits a form around it). The address
 * is checked here; `onAdd` does the adding and says whether it worked. The box is emptied only if it still holds the
 * address that was added (the person may already be typing the next one), focus stays in it, and nothing is added
 * again while an add is under way.
 */
export function AddAddressField({
  onAdd,
  pending,
  error,
  onEdit,
  inputRef,
}: {
  onAdd: (email: string) => Promise<boolean>;
  pending: boolean;
  /** A problem with the address that the caller knows about (the server refused it). */
  error?: string;
  /** The person changed the address, so a problem shown about the old one no longer applies. */
  onEdit?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownRef;
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState<string>();

  // `pending` is state, which a second press in the same instant has not seen yet; this is the guard that cannot be late.
  const adding = useRef(false);

  async function add() {
    if (pending || adding.current) return;
    const parsed = emailSchema.safeParse(value);
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0].message);
      return;
    }
    setInvalid(undefined);
    adding.current = true;
    try {
      if (await onAdd(parsed.data)) {
        setValue((current) => (current.trim().toLowerCase() === parsed.data ? "" : current));
        input.current?.focus();
      }
    } finally {
      adding.current = false;
    }
  }

  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <Field
          ref={input}
          label="Add a person by email"
          type="email"
          autoComplete="off"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(undefined);
            onEdit?.();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault(); // Enter adds the person; it must not submit a form around this
              void add();
            }
          }}
          error={invalid ?? error}
        />
      </div>
      <Button type="button" variant="quiet" busy={pending} onClick={() => void add()} className="mb-2.5">
        {pending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}
