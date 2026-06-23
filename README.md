# Tunicious v2

Personal music player — MusicBrainz metadata, YouTube playback, Last.fm scrobbling.

**Status:** Phase 3 — Playlists

Full specification: [docs/Tunicious_v2_Iteration1_Specification.md](docs/Tunicious_v2_Iteration1_Specification.md)

## Stack

- Vue 3, TypeScript, Vite, Tailwind CSS 4, Pinia, Vue Router
- Firebase Auth, Cloud Firestore, Hosting

## Prerequisites

- Node.js 22+
- A Firebase project with **Authentication** and **Cloud Firestore** enabled

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

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |

## Deploy (Firebase Hosting)

```bash
npm run build
firebase deploy --only hosting
```

Ensure `.env` values are set in your CI/deploy environment (Vite inlines `VITE_*` at build time).

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
- [ ] Phase 4 — YouTube resolution

## Next: Phase 4

YouTube track resolution and server proxy. See spec §11 Phase 4.
