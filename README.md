# Tunicious v2

Personal music player — MusicBrainz metadata, YouTube playback, Last.fm scrobbling.

**Status:** Phase 8 — Polish and ship

Specifications:

- Iteration 1: [docs/Tunicious_v2_Iteration1_Specification.md](docs/Tunicious_v2_Iteration1_Specification.md)
- Iteration 2 (evaluation funnel): [docs/Tunicious_v2_Iteration2_Specification.md](docs/Tunicious_v2_Iteration2_Specification.md)

## Stack

- Vue 3, TypeScript, Vite, Tailwind CSS 4, Pinia, Vue Router
- Firebase Auth, Cloud Firestore, Hosting

## Prerequisites

- Node.js 22+
- A Firebase project with **Authentication** and **Cloud Firestore** enabled
- A **YouTube Data API v3** key (for track resolution)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment template and fill in Firebase web app credentials:

   ```bash
   cp .env.example .env
   ```

   Get values from Firebase console → Project settings → Your apps → Web app config.

3. Enable sign-in methods in Firebase console → Authentication:

   - **Google**
   - **Email/Password** (users can create an account on the sign-in screen)

4. Deploy Firestore rules (once per project):

   ```bash
   firebase deploy --only firestore:rules
   ```

5. Start the dev server:

   ```bash
   npm run dev
   ```

6. Open **Explorer** — search artists or albums, browse release groups, releases, and tracklists.

## MusicBrainz (Phase 1)

No MusicBrainz account or API key. Set your contact email in `.env`:

```env
VITE_MUSICBRAINZ_DEFAULT_USER_AGENT=Tunicious/2.0 (your@email.com)
```

Optional per-user override in **Settings**. Requests are rate-limited to 1/sec.

- **Local dev:** Vite proxies `/api/musicbrainz` → musicbrainz.org
- **Production:** Firebase Cloud Function `musicbrainzProxy` (deploy functions + hosting)

## YouTube (Phase 4)

Create a YouTube Data API v3 key in Google Cloud Console and add it to `.env`:

```env
YOUTUBE_API_KEY=your-api-key
```

**API key restrictions (Google Cloud Console → Credentials):**

- **Local dev:** Application restriction → *HTTP referrers* → add `http://localhost:4827/*`. The Vite proxy sends this referrer on your behalf. If your dev URL differs, set `YOUTUBE_API_REFERER` in `.env` to match (e.g. `http://localhost:4827/`).
- **Production (Cloud Functions):** `youtubeProxy` sends `YOUTUBE_API_REFERER` when that variable is set in `functions/.env`. The key currently allows `http://localhost:4827/` only, so that is the value in use. An unrestricted key can omit `YOUTUBE_API_REFERER`.

Resolve tracks from **Library → album detail**: auto-resolve, manual search, paste URL, or **resolve from Topic playlist** (find/link playlist URL).

- **Local dev:** Vite proxies `/api/youtube` → YouTube Data API (set `YOUTUBE_API_REFERER` if key is referrer-restricted)
- **Production:** Firebase Cloud Function `youtubeProxy` (`YOUTUBE_API_KEY` and, when the key is referrer-restricted, `YOUTUBE_API_REFERER` in `functions/.env`)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |

## Deploy (Firebase Hosting)

v2 is hosted on Firebase project `tunicious-40e1b` (already set in `.firebaserc`):

- https://tunicious-40e1b.web.app
- https://tunicious-40e1b.firebaseapp.com

v1 (`tunicious.com`) is a different Firebase project. Deploy this repo only to `tunicious-40e1b`.

```bash
npm run build
cd functions && npm install && npm run build
cd ..
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Vite inlines `VITE_*` from the repo root `.env` at build time. Use the existing `tunicious-40e1b` web app config. The placeholders in `.github/workflows/ci.yml` are for the CI build only.

2nd gen functions read `functions/.env` at deploy time (`YOUTUBE_API_KEY`, `LASTFM_API_KEY`, `LASTFM_SHARED_SECRET`, `MUSICBRAINZ_DEFAULT_USER_AGENT`). Copy `functions/.env.example` to `functions/.env` and fill it in. That file is gitignored. `firebase functions:config:set` does not set these variables.

- `YOUTUBE_API_KEY` — YouTube Data API v3 key. If the key is HTTP-referrer restricted, also set `YOUTUBE_API_REFERER` to an allow-listed value. The key in use allows `http://localhost:4827/` only, so `functions/.env` sets that referer until the key allow list includes `https://tunicious-40e1b.web.app/` or the key has no referrer restriction.
- `LASTFM_API_KEY` and `LASTFM_SHARED_SECRET` — a Last.fm application whose callback is `https://tunicious-40e1b.web.app/lastfm/callback`. Localhost keeps its own app. The functions do not read `LASTFM_CALLBACK_URL`; Last.fm stores the callback on the API application.
- `MUSICBRAINZ_DEFAULT_USER_AGENT` — a contact string.

## Project layout

```
src/
  components/     Shared UI
  layouts/        App shell
  lib/            Firebase, services (expanded per phase)
  router/         Routes + auth guard
  stores/         Pinia stores
  views/          Route screens
  types/          Shared TypeScript types
functions/        API proxies (Phase 1+)
docs/             Product specification
```

## Phase checklist

- [x] Phase 0 — Auth shell, Firestore user profile, placeholder routes
- [x] Phase 1 — MusicBrainz Explorer (search, browse, tracklists)
- [x] Phase 2 — Library import (multi-artist `artistIds`, dedupe on `releaseMbid`)
- [x] Phase 3 — Playlists (CRUD, membership, reorder, queue builder)
- [x] Phase 4 — YouTube resolution (mappings, channel preference, Topic playlist resolve)
- [x] Phase 5 — Playback engine (IFrame player, global bar, album/playlist play)
- [x] Phase 6 — Session tracking (PlaybackSession, TrackListenRecord, /history, local playcounts)
- [x] Phase 7 — Last.fm (connect, scrobbling, now playing, playcount sync)
- [ ] Phase 8 — Polish and ship (in progress; hosted at https://tunicious-40e1b.web.app)

## Phase 8 (in progress)

- [x] Home screen with recent listens and resume playback
- [x] Mobile-responsive layout and player bar
- [x] Settings polish
- [x] Firestore indexes and security rules audit
- [x] Production deploy (https://tunicious-40e1b.web.app)

## Last.fm (Phase 7)

Create a Last.fm API application at [last.fm/api/account/create](https://www.last.fm/api/account/create) and add credentials to `.env`:

```env
LASTFM_API_KEY=your-api-key
LASTFM_SHARED_SECRET=your-shared-secret
LASTFM_CALLBACK_URL=http://localhost:4827/lastfm/callback
```

Use a separate Last.fm app per environment (dev vs production) — each app allows one callback URL.

Connect in **Settings → Last.fm**. Scrobbles fire when a listen reaches `min(track length / 2, 4 minutes)` of playing time.

- **Local dev:** Vite middleware proxies `/api/lastfm` (uses `LASTFM_*` from `.env`)
- **Production:** Firebase Cloud Function `lastfmProxy` (`LASTFM_API_KEY` and `LASTFM_SHARED_SECRET` in `functions/.env`). Register the callback `https://tunicious-40e1b.web.app/lastfm/callback` on that Last.fm application.

## Next

The app is hosted at https://tunicious-40e1b.web.app. Use a Last.fm application whose callback is `https://tunicious-40e1b.web.app/lastfm/callback` before connecting Last.fm there. Localhost keeps its own Last.fm app. See spec §11 Phase 8.
