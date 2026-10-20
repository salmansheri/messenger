# Images are served by short-lived signed URLs issued per viewer

Attachments and avatars live in S3-compatible object storage, behind an `ObjectStorage` port. The API never streams them. Each response that mentions an image carries a signed URL (15 minutes) built for that viewer, and only after the same checks that decide whether they may read the Message (joined before it, not hidden by them). We rejected proxying every image through an authenticated endpoint, because an `<img>` cannot send a bearer header, so the client would have to fetch each image in script and turn it into a blob, losing browser caching and lazy loading. We also rejected public unguessable URLs, because a leaked link would stay valid for ever and a removed Participant could keep reading.

## Consequences

- A link is a capability for up to 15 minutes: anyone who holds it can fetch the file until it lapses, even after the Message is hidden or the Participant is removed. Deleting a Message for everyone deletes the stored files, so its links stop working at once.
- Clients must expect expiry: a failed image load triggers one refetch of the history, then a visible "Couldn't load image" with a retry.
- Uploads are validated by decoding, re-encoded without metadata (no EXIF or GPS), and given a thumbnail, so the stored bytes are ours, not the sender's.
- Unattached uploads are removed after 24 hours.
- Avatars use the same mechanism, visible only to people who share a Conversation with the User.
