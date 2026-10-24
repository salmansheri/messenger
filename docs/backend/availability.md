# Backend: Availability

Moved out of CLAUDE.md; read it before working in this area and keep it up to date.

- Availability (#65; #67, the backend, `AvailabilityService`, GLOSSARY "Availability"): `PUT /api/v1/users/me/availability` `{availability: AVAILABLE|BUSY|AWAY}` sets how the caller says they can be reached and returns the profile (200). Rules:
  - Every User starts `AVAILABLE` (migration `V19`, a column on `users` with a check constraint). It stays until changed, with no timers, and silences nothing (Mute does that).
  - A missing or unknown value (`DO_NOT_DISTURB`) is a 400 under `errors.availability` (since #67 `GlobalExceptionHandler` reports any value that is not one of an enum's choices as a field error, 'must be one of …', also for mute and platform; any other unreadable body stays a plain 400).
  - Choosing the value already held changes nothing, sends no event and costs nothing. A real change is limited to `app.availability.max-changes-per-hour` (20) per User through `RateLimiter` (429 with `Retry-After`, counted before the write).
  - The change takes the User row lock (`findByIdForUpdate`).

  Where it is read:
  - `UserProfile` (every `/users/me` answer) and `PresenceView` (`GET /conversations/{id}/presence`, online or offline) carry `availability`.
  - It is deliberately **not** on `participants` in `ConversationResponse`: it follows presence's audience, which a Block filters, and the list does not.

  Event: `availability.changed {userId, availability}` goes after commit to `presence.changed`'s audience (co-Participants less everyone the User blocks or is blocked by, `findBlockedEitherWayWith`) and to the User's own sessions. A Block therefore hides it both ways, in presence reads and in events. Tests: `AvailabilityTests`.
