# Tunicious v2

Personal music player — MusicBrainz metadata, YouTube playback, Last.fm scrobbling.

**Status:** Phase 0 — authenticated app shell.

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

6. Open the app, sign in. On first sign-in a `users/{uid}` profile document is created in Firestore.

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

## Phase 0 checklist

- [x] Vue 3 + TS + Vite + Tailwind + Pinia + Router
- [x] Firebase Auth + Firestore user profile on first sign-in
- [x] App layout, nav, placeholder routes
- [x] CI: `npm run build` on push
- [ ] Firebase project configured locally (your step)
- [ ] Deployed empty shell (your step)

## Next: Phase 1

MusicBrainz Explorer — server proxy, search, release group/release browse. See spec §11 Phase 1.
