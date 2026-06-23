# Cloud Functions

## musicbrainzProxy

Proxies `GET /api/musicbrainz/**` to `https://musicbrainz.org/ws/2/**`.

- Sets `User-Agent` from `X-MusicBrainz-User-Agent` header or `MUSICBRAINZ_DEFAULT_USER_AGENT`
- Throttles to 1 request per second
- Used in production via Firebase Hosting rewrite

Local dev uses the Vite proxy instead (`vite.config.ts`).

## youtubeProxy

Proxies `GET /api/youtube/**` to the YouTube Data API v3.

- Requires `YOUTUBE_API_KEY` in Functions environment
- Used for search and video metadata during track resolution
- Used in production via Firebase Hosting rewrite (`/api/youtube/**`)

Local dev uses the Vite plugin instead (`src/lib/youtube/vitePlugin.ts` + `YOUTUBE_API_KEY` in `.env`).

## Deploy

```bash
cd functions && npm install && npm run build
firebase deploy --only functions,hosting
```

Set environment variables in Firebase Functions config:

- `MUSICBRAINZ_DEFAULT_USER_AGENT` — contact string for MusicBrainz
- `YOUTUBE_API_KEY` — YouTube Data API v3 key
