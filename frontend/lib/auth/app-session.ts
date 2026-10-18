import { call, sdk, setAccessTokenProvider } from "@/lib/api";
import { createSession } from "./session";

/**
 * The one session of this browser tab. It resumes through the refresh cookie (the backend rotates it on every refresh),
 * and the API client asks it for the access token to send. Only client code starts it.
 */
export const session = createSession({
  async requestTokens() {
    const issued = await call(sdk.refresh());
    if (!issued.accessToken || !issued.expiresIn) throw new Error("The refresh answer had no access token.");
    return { accessToken: issued.accessToken, expiresInSeconds: issued.expiresIn };
  },
});

setAccessTokenProvider(() => session.token());
