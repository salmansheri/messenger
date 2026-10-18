/** How many wrong guesses the backend allows for one code before it stops working (app.otp.max-attempts). */
export const WRONG_CODE_LIMIT = 5;

/** Wrong codes entered for one address since a code was last sent to it. */
export type WrongTries = { email: string; count: number };

export const NO_WRONG_TRIES: WrongTries = { email: "", count: 0 };

/** Another wrong code for this address. Tries for a different address do not carry over. */
export function afterWrongCode(tries: WrongTries, email: string): WrongTries {
  return { email, count: (tries.email === email ? tries.count : 0) + 1 };
}

/** The backend refuses further guesses at this point, even the right code. */
export function wrongTriesExhausted(tries: WrongTries): boolean {
  return tries.count >= WRONG_CODE_LIMIT;
}
