# Cloud Functions

## musicbrainzProxy

Proxies `GET /api/musicbrainz/**` to `https://musicbrainz.org/ws/2/**`.

- Sets `User-Agent` from `X-MusicBrainz-User-Agent` header or `MUSICBRAINZ_DEFAULT_USER_AGENT`
- Throttles to 1 request per second
- Used in production via Firebase Hosting rewrite

Local dev uses the Vite proxy instead (`vite.config.ts`).

Deploy:

```bash
cd functions && npm install && npm run build
firebase deploy --only functions,hosting
```

Set `MUSICBRAINZ_DEFAULT_USER_AGENT` in Firebase Functions environment if needed.
