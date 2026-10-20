/**
 * Which item of a menu takes focus after a key, or nothing when the key is not one a menu uses. The arrows wrap round,
 * Home and End go to the ends, and with nothing focused yet (`current` is -1) down starts at the first item and up at the last.
 */
export function nextMenuIndex(count: number, current: number, key: string): number | undefined {
  if (count === 0) return undefined;
  switch (key) {
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowUp":
      return current <= 0 ? count - 1 : current - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}
