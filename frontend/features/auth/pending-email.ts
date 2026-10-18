/**
 * The address just signed up with, kept for the next screen so it stays out of the URL (history, server logs and
 * Referer headers). It lives in this tab's sessionStorage only until the address is verified.
 */
const KEY = "pending-verification-email";

/** Storage can be unavailable (private windows, blocked site data), and nothing here may break the page. */
function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberPendingEmail(email: string) {
  try {
    storage()?.setItem(KEY, email);
  } catch {
    // the verification screen simply asks for the address
  }
}

export function pendingEmail(): string {
  try {
    return storage()?.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function forgetPendingEmail() {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // nothing to forget
  }
}
