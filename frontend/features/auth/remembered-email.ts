/**
 * An address carried from one screen to the next so it stays out of the URL (history, server logs and Referer
 * headers). It lives in this tab's sessionStorage only until the step it was kept for is done.
 */
function rememberedEmailStore(key: string) {
  // Storage can be unavailable (private windows, blocked site data), and nothing here may break the page.
  const storage = () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    remember(email: string) {
      try {
        storage()?.setItem(key, email);
      } catch {
        // the next screen simply asks for the address
      }
    },
    read(): string {
      try {
        return storage()?.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    forget() {
      try {
        storage()?.removeItem(key);
      } catch {
        // nothing to forget
      }
    },
  };
}

/** The address just signed up with (or tried to sign in with before verifying), for the verification screen. */
export const verificationEmail = rememberedEmailStore("pending-verification-email");

/** The address a password reset code was just requested for, for the reset screen. */
export const resetEmail = rememberedEmailStore("pending-reset-email");
