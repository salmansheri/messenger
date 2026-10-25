"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { nextMenuIndex } from "./menu-keys";

const CloseMenu = createContext<(giveFocusBack?: boolean) => void>(() => {});

/** Closes the menu it is used inside; `true` gives focus back to the menu's button. */
export function useCloseMenu() {
  return useContext(CloseMenu);
}

/** One choice in a menu. `busy` looks disabled and does nothing when chosen, but stays focusable. */
export function MenuItem({
  children,
  onSelect,
  busy,
  ref,
}: {
  children: ReactNode;
  onSelect: () => void;
  busy?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={busy || undefined}
      onClick={() => !busy && onSelect()}
      className="rounded-sm px-3 py-2 text-left text-base text-ink hover:bg-band focus:bg-band aria-disabled:opacity-60"
    >
      {children}
    </button>
  );
}

type Props = {
  /** The button's name, and the menu's. */
  label: string;
  /** What the button looks like (an icon, usually); it should not carry text of its own. */
  icon: ReactNode;
  /** The choices, as `MenuItem`s; they close the menu with `useCloseMenu()`. */
  children: ReactNode;
  /** Shown under the choices while the menu is open: a problem with the last choice, say. */
  below?: ReactNode;
  /** Called when the menu closes, however it closes. */
  onClose?: () => void;
  /**
   * Shown instead of the choices while it is set: a question about the choice just made (Block asks first), whose
   * buttons are ordinary buttons, not menu items. It moves focus itself.
   */
  replacement?: ReactNode;
  /** The trigger's colours, when the page's own would not read (over the dark glass of a viewer, say). */
  triggerClassName?: string;
};

/**
 * A button that opens a menu. The first choice takes focus when it opens; the arrow keys (wrapping), Home and End move
 * through the choices, Escape closes it and gives focus back to the button, and so does a click anywhere else.
 */
export function DropdownMenu({ label, icon, children, below, onClose, replacement, triggerClassName = "text-ink-muted hover:text-ink" }: Props) {
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);

  const close = useCallback(
    (giveFocusBack = false) => {
      setOpen(false);
      onClose?.();
      if (giveFocusBack) trigger.current?.focus();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, close]);

  // Opens upward when there is no room below inside the scrolling area it sits in (the last Messages of a history).
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const area = trigger.current.closest<HTMLElement>('[role="region"]')?.getBoundingClientRect();
    const room = (area?.bottom ?? window.innerHeight) - trigger.current.getBoundingClientRect().bottom;
    setUpward(room < panel.current.offsetHeight + 8);
  }, [open, replacement]);

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (replacement) return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const next = nextMenuIndex(items.length, items.indexOf(document.activeElement as HTMLElement), event.key);
    if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  return (
    <div ref={root} className="relative" onKeyDown={keyDown}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? close(true) : setOpen(true))}
        className={`flex size-9 items-center justify-center rounded-sm ${triggerClassName}`}
      >
        {icon}
      </button>
      {open && (
        <div
          id={menuId}
          ref={panel}
          className={`absolute right-0 z-10 w-64 rounded-sm border border-rule bg-paper p-1 shadow-sm ${upward ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          <CloseMenu.Provider value={close}>
            {replacement ?? (
              <div role="menu" aria-label={label} className="flex flex-col">
                {children}
              </div>
            )}
          </CloseMenu.Provider>
          {below}
        </div>
      )}
    </div>
  );
}

/** The three dots of a menu button. */
export function DotsIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
    </svg>
  );
}
