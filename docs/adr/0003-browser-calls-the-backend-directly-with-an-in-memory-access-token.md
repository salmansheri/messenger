# The browser calls the backend directly and holds the access token only in memory

The Next.js app does not proxy the API. The browser calls the backend at `NEXT_PUBLIC_API_URL` (REST and the `/ws` socket) using the CORS-with-credentials setup the backend already enforces. The access token lives only in JavaScript memory; on every page load the app gets one by calling `POST /api/v1/auth/refresh`, which succeeds because the browser sends the `HttpOnly; SameSite=Strict` refresh cookie. Concurrent requests share a single in-flight refresh. Every signed-in screen is therefore a client component: the server never sees the token, so it cannot render user data.

We considered proxying `/api/*` through Next so everything is same-origin. That removes the CORS and domain constraint, but Next's rewrites do not dependably proxy WebSockets, so the socket would go direct anyway and we would carry two ways of reaching the backend. We also considered keeping the access token in `localStorage` or a non-HTTP-only cookie to survive reloads; that exposes it to any script on the page for the sake of saving one refresh call.

## Consequences

- In production the frontend and the API must share a registrable domain (for example `app.example.com` and `api.example.com`), because the refresh cookie is `SameSite=Strict`; on `localhost` any port counts as the same site. The frontend origin must be listed in `app.cors.allowed-origins`.
- A reload costs one refresh round trip before the app can show data, and a failed refresh means signed out.
- The access token is not in storage, so it cannot be stolen from storage; a script running in the page could still use it while the page is open.
- The access token lasts 15 minutes and sockets only live as long as their token (see the backend's `StompSessions`), so the client must refresh before expiry and reconnect the socket with the new token.
