# Tunicious v2

Personal music player — MusicBrainz metadata, YouTube playback, Last.fm scrobbling.

**Status:** Phase 6 — Session tracking

Full specification: [docs/Tunicious_v2_Iteration1_Specification.md](docs/Tunicious_v2_Iteration1_Specification.md)

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
   - **Email/Password** (create test users as needed)

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
- **Production (Cloud Functions):** Server-side calls have no browser referrer — use *None* for application restrictions on a separate key, or IP-restrict to Google’s egress ranges. Set that key as `YOUTUBE_API_KEY` in Functions config.

Resolve tracks from **Library → album detail**: auto-resolve, manual search, paste URL, or **resolve from Topic playlist** (find/link playlist URL).

- **Local dev:** Vite proxies `/api/youtube` → YouTube Data API (set `YOUTUBE_API_REFERER` if key is referrer-restricted)
- **Production:** Firebase Cloud Function `youtubeProxy` (set `YOUTUBE_API_KEY` in Functions config)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |

## Deploy (Firebase Hosting)

```bash
npm run build
cd functions && npm run build
firebase deploy --only functions,hosting
```

Ensure `.env` values are set in your CI/deploy environment (Vite inlines `VITE_*` at build time). Set `YOUTUBE_API_KEY` and `MUSICBRAINZ_DEFAULT_USER_AGENT` for Cloud Functions.

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

## Next: Phase 7

Last.fm connect, scrobbling, and playcount sync. See spec §11 Phase 7.
