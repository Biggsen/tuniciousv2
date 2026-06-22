# Tunicious v2 — Iteration 1 Specification

**Status:** Ready to build  
**Validation:** Architecture and behaviour below were proven in a disposable local lab (MusicBrainz explorer, library import, YouTube resolution, playback, session tracking, Last.fm). This document is **self-contained** — no other spec files are required to implement iteration 1.

---

## 1. Purpose

Build the **first production iteration** of Tunicious v2: a **personal music player** backed by **MusicBrainz** (metadata), **YouTube** (playback), and **Last.fm** (listening authority).

Build in a **new repository**. The lab was throwaway proof-of-concept software and does not ship as production code.

### 1.1 Iteration 1 delivers

- MusicBrainz browse/search and album import
- Personal **library** (artists + albums)
- **Playlists** — collections of albums, multi-membership, playable
- YouTube track resolution and playback
- App-owned listen telemetry
- Last.fm connect, now playing, scrobbling, playcount sync

### 1.2 Iteration 1 does not deliver

- Pipelines, stages UI, evaluation funnel (see **Appendix A** for iteration 2 data model)
- Yes / No / Undo workflow
- Smart queue generation (round-robin, least-played across stages)
- Spotify migration tooling
- Social / friends / recommendations

### 1.3 Design principles

1. **Playlist** is the user-facing collection primitive — a list of albums you can play.
2. **Stage** is a pipeline feature (iteration 2), not a collection. A stage **references** a playlist; albums live on playlists.
3. An album may belong to **many playlists** simultaneously.
4. An album may exist in the **library** without belonging to any playlist.
5. **No product prefix** on data model type names (`Album`, not `TuniciousAlbum`).
6. **Metadata** (MusicBrainz / library) is separate from **playback resolution** (YouTube mappings).
7. **Sessions** (local listen truth) and **Last.fm** (social/history authority) remain separate layers.

---

## 2. Technology stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | Vue 3, TypeScript, Vite | |
| Styling | Tailwind CSS 4 | |
| State | Pinia | |
| Routing | Vue Router | |
| Auth | Firebase Auth | Email or Google |
| Database | Cloud Firestore | Per-user data |
| Hosting | Firebase Hosting (or equivalent) | SPA + serverless API routes |
| External APIs | MusicBrainz, YouTube Data API v3, Last.fm | |

### 2.1 API proxy requirements

| API | Production approach | Reason |
|-----|---------------------|--------|
| **MusicBrainz** | Server proxy | CORS, rate limiting, User-Agent policy |
| **YouTube** | Server proxy | API key must not ship in client bundle |
| **Last.fm** | Server-side token exchange + signed calls | Shared secret must not ship in client |

The lab used browser-direct calls and build-time key injection for local POC only. Production wraps secrets behind thin API endpoints.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Vue 3 SPA (Pinia)                        │
│  Explorer │ Library │ Playlists │ Player bar │ Settings     │
└──────────┬──────────────────┬──────────────────┬────────────┘
           │                  │                  │
     MusicBrainz proxy   Firestore reads/writes   YouTube + Last.fm
           │                  │                  proxies
           ▼                  ▼                  ▼
     musicbrainz.org    Firebase Auth +      Google / last.fm
                        Cloud Firestore
```

### 3.1 Core flows

**Import album**  
Explorer → select MusicBrainz **release** → build `Album` + `Artist` → write Firestore → optional background YouTube auto-resolve.

**Add to playlist**  
Create `PlaylistMembership` — does not remove album from other playlists.

**Play playlist**  
Load memberships in order → expand each album's tracks → join YouTube mappings → build queue → IFrame API playback → session telemetry → Last.fm.

**Play album**  
Same as playlist with a single-album tracklist.

---

## 4. Data model (iteration 1)

### 4.1 Conventions

- TypeScript interfaces align with Firestore document shapes where 1:1.
- Collections: lowercase plural or nested subcollections under `users/{uid}`.
- IDs: UUID v4 (client-generated), except Firebase Auth `uid`.

### 4.2 `User`

Firestore: `users/{uid}`

| Field | Type | Notes |
|-------|------|-------|
| `displayName` | string | |
| `email` | string | From auth |
| `createdAt` | timestamp | |
| `settings` | object | MusicBrainz User-Agent override, preferences |
| `lastfm` | object? | Session key, username, `connectedAt` — or separate subcollection |

### 4.3 `Artist`

Firestore: `users/{uid}/artists/{artistId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `name` | string | Display |
| `sortName` | string? | From MusicBrainz |
| `artistMbid` | string? | Import provenance |
| `scrobbleName` | string? | Last.fm canonical name; defaults to normalized `name` |
| `nameLower` | string | Prefix search |
| `importedAt` | timestamp | |

### 4.4 `Album`

Firestore: `users/{uid}/albums/{albumId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | App-owned |
| `title` | string | |
| `artistId` | string | FK → `artists` |
| `artist` | string | Denormalized display (frozen at import) |
| `albumYear` | string? | Release group `first-release-date` year |
| `type` | string? | RG primary-type lowercase: `album`, `ep`, `single`, … |
| `releaseMbid` | string | Import provenance |
| `coverUrl` | string? | Cover Art Archive at import |
| `tracks` | `Track[]` | Embedded ordered tracklist |
| `importedAt` | timestamp | |

**Import unit:** MusicBrainz **release** (edition), not release group.  
**Dedupe:** One album per `releaseMbid` per user on import.

### 4.5 `Track` (embedded on `Album`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable for mappings, playcounts, sessions |
| `trackNumber` | string | |
| `title` | string | |
| `lengthMs` | number? | From MusicBrainz recording length |

Omitted intentionally: `recordingMbid`, disc number (flat tracklist for v1). Secondary release-group types (Compilation, Live, …) omitted; add later if filtering needs them.

### 4.6 `Playlist`

Firestore: `users/{uid}/playlists/{playlistId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `name` | string | User-visible |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |
| `description` | string? | Optional |

No pipeline fields. A playlist is always a playlist.

### 4.7 `PlaylistMembership`

Firestore: `users/{uid}/playlists/{playlistId}/members/{albumId}`  
Document ID = `albumId` for idempotent add/remove.

| Field | Type | Notes |
|-------|------|-------|
| `albumId` | string | |
| `addedAt` | timestamp | |
| `position` | number | Order within playlist |

**Invariant:** Same album may appear in many playlists. Adding to playlist B does not remove from playlist A.

### 4.8 `TrackYouTubeMapping`

Firestore: `users/{uid}/youtube_mappings/{trackId}`  
Document ID = `trackId`.

| Field | Type | Notes |
|-------|------|-------|
| `trackId` | string | |
| `videoId` | string | |
| `videoTitle` | string | |
| `channelTitle` | string? | |
| `durationMs` | number? | |
| `source` | `'auto' \| 'manual'` | |
| `resolvedAt` | timestamp | |
| `searchQuery` | string? | For debug / re-resolve |

Remove mappings when parent album is deleted. One mapping per track (`zero` or `one` `videoId`).

### 4.9 `TrackPlayStats`

Firestore: `users/{uid}/track_stats/{trackId}`

| Field | Type | Notes |
|-------|------|-------|
| `trackId` | string | |
| `playcount` | number | App-owned; Last.fm wins on sync |
| `lastPlayedAt` | timestamp? | |
| `lastSyncedAt` | timestamp? | |
| `lastfmPlaycountAtSync` | number? | |

### 4.10 `PlaybackSession`

Firestore: `users/{uid}/playback_sessions/{sessionId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `albumId` | string | |
| `albumTitle` | string | Denormalized |
| `artist` | string | |
| `sourceType` | `'album' \| 'playlist'` | |
| `sourcePlaylistId` | string? | When playing from playlist |
| `startedAt` | timestamp | |
| `endedAt` | timestamp? | |

### 4.11 `TrackListenRecord`

Firestore: `users/{uid}/track_listens/{listenId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `playbackSessionId` | string | |
| `trackId` | string | |
| `albumId` | string | |
| `title` | string | Denormalized |
| `artist` | string | |
| `albumTitle` | string | |
| `videoId` | string | |
| `trackLengthMs` | number? | |
| `sourcePlaylistId` | string? | |
| `startedAt` | timestamp | **Last.fm scrobble timestamp** |
| `endedAt` | timestamp | |
| `listenedMs` | number | Playing time only; pauses excluded |
| `completed` | boolean | ≥ 80% or natural end (display metric) |
| `endReason` | enum | `completed`, `skipped`, `stopped`, `queue_cleared`, `error` |
| `scrobbled` | boolean? | Dedupe Last.fm submit |

**Scrobble vs completed:** A listen may scrobble without being marked `completed` (e.g. ~50% then skip after threshold). Both metrics are valid.

### 4.12 Import pipeline (release → library)

On import from a MusicBrainz release:

1. Fetch release detail from MusicBrainz.
2. Resolve release-group fields for `albumYear` and `type` (fetch RG if stub incomplete).
3. Build flat `Track[]` from all media on the release.
4. Format artist credit → seed `Artist` (find or create by normalized name / optional `artistMbid`).
5. Fetch cover from Cover Art Archive using `releaseMbid`.
6. Write `Album` with app-owned IDs; freeze display fields.
7. **Sever:** library does not live-sync to MusicBrainz for normal use.

Edition metadata (country, format, packaging) stays in Explorer only — not required on the frozen library copy.

---

## 5. External services

### 5.1 MusicBrainz

- **User-Agent:** Required; per-user override in Settings; app default on proxy.
- **Rate limit:** 1 request/second — throttle in client or proxy.
- **Browse layer:** Release groups for search and album concepts; **releases** for definitive tracklists.
- **Year:** From release group `first-release-date`, not reissue date on a later edition.
- **Cover:** Cover Art Archive fetched once at import.
- **IDs:** Store `releaseMbid` as provenance; app-owned album IDs at runtime. Optional `artistMbid` on artist; no recording MBIDs on library tracks.

### 5.2 YouTube

- **Auto search query:** `[artist] Topic [track]` — **omit album title** from default auto-query (manual search may include it).
- **Ranking:** Score candidates by artist-in-title and duration proximity; prefer plausible Topic/label uploads.
- **Auto-resolve:** Starting point only — live versions, covers, and junk results are common. Manual override (search → pick, paste URL/ID) is first-class.
- **At playback:** Use cached `videoId` only; do not re-search. Manual and auto mappings behave identically.
- **Unresolved:** Clear UI when `videoId` is missing; block or skip at play time.
- **Production:** All Data API calls via server proxy (lab used referrer-restricted browser keys for POC only).
- **Optional improvements (post-v1):** Penalize title tokens (live, cover, karaoke); stricter duration gate; second-pass query without `Topic` when first pass fails.

### 5.3 Last.fm

- **Now playing:** `track.updateNowPlaying` when a track starts.
- **Scrobble threshold:** `listenedMs ≥ min(trackLength/2, 4 minutes)`.
- **Scrobble timestamp:** Track **start** (`startedAt`), not end.
- **Elapsed time for threshold:** Playing time only; pauses excluded (from session telemetry).
- **Playcount sync:** `track.getInfo` (artist + track) → Last.fm authoritative on refresh; replaces local count for that user.
- **Normalization:** Unicode apostrophe (`’`) → ASCII (`'`); `Artist.scrobbleName` when MB credit ≠ Last.fm canonical name.
- **Auth flow:** `auth.getToken` → user approves in popup → `auth.getSession`. Include explicit callback URL on Last.fm API app.
- **Auth fallback:** When redirect to callback fails (common), poll `auth.getSession` every ~2s with pending token; offer manual “Finish login”. Callback route notifies opener via `postMessage` when redirect works.
- **Production:** Token exchange and API signing server-side; shared secret not in client bundle.
- **Dedupe:** Track which `TrackListenRecord` IDs have been scrobbled.
- **Retry:** Last.fm auth API may return intermittent 502 — retry.

---

## 6. Application design

### 6.1 Routes

| Route | Screen | Purpose |
|-------|--------|---------|
| `/` | Home | Recent listens, quick resume |
| `/explorer` | MusicBrainz Explorer | Search, browse, import |
| `/library` | Library | Imported albums |
| `/library/:id` | Album detail | Tracklist, play, inline resolve |
| `/artists` | Artists | Artist list |
| `/artists/:id` | Artist detail | Albums by artist |
| `/playlists` | Playlists | List, create, delete |
| `/playlists/:id` | Playlist detail | Members, reorder, add, **Play** |
| `/history` | Listening history | Sessions and track listens |
| `/settings` | Settings | Account, MusicBrainz UA, Last.fm |
| `/lastfm/callback` | OAuth callback | Hidden route |

Iteration 1 collapses lab's separate Resolution, Playback, and Sessions routes: resolution is inline on album/playlist; playback uses a global player bar; history is `/history`.

### 6.2 Global UI

- **Player bar** — persistent when queue active: now playing, progress, play/pause, skip.
- **YouTube player** — hidden iframe, single instance in app shell.
- **Unresolved tracks** — badge on album/playlist; inline resolve (search, manual URL, pick candidate).

### 6.3 Playback queue

```typescript
interface PlaybackQueueItem {
  trackId: string
  albumId: string
  title: string
  artist: string
  albumTitle: string
  trackNumber: string
  lengthMs?: number
  videoId: string | null
  sourceType: 'album' | 'playlist'
  sourcePlaylistId?: string
}
```

- **Play album:** Tracks in album order; skip or block tracks without `videoId`.
- **Play playlist:** Membership order → each album's tracks in album order.
- **Shuffle / smart queues:** Iteration 2.

### 6.4 Playback engine behaviour (lab-validated)

- Queue with play, pause, resume, skip, next/previous.
- Progress polled from IFrame API (~500ms while playing).
- On track change: finalize previous listen (session), start new listen + album session if album changed.
- On natural end or skip: advance queue; clear queue ends active sessions.
- `sourcePlaylistId` propagated when queue built from playlist.

### 6.5 Session tracking behaviour (lab-validated)

- One `PlaybackSession` per album while playing tracks from that album; end when leaving album or stopping.
- One `TrackListenRecord` per track play; finalize on skip, stop, track end, or queue clear.
- `listenedMs` accumulates only while status is `playing`.
- `completed` when `listenedMs ≥ 80%` of track length or natural end.
- Completed listens increment `TrackPlayStats.playcount` locally.
- All session records scoped to authenticated `userId`.

---

## 7. Security

- All user data under `users/{uid}/**` — read/write only when `request.auth.uid == uid`.
- Per-user library in v1 (no shared album documents across users).
- Last.fm session key stored server-side or with appropriate protection; not world-readable.
- YouTube and Last.fm secrets only on server.

---

## 8. Environment variables

```bash
# Firebase (client — Vite prefix)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Server / Cloud Functions only
YOUTUBE_API_KEY=
LASTFM_API_KEY=
LASTFM_SHARED_SECRET=
LASTFM_CALLBACK_URL=

# Optional
MUSICBRAINZ_DEFAULT_USER_AGENT=Tunicious/2.0 (your@email.com)
```

---

## 9. Known limitations (accept for v1)

| Area | v1 stance |
|------|-----------|
| YouTube auto-resolve | Imperfect; manual correction required sometimes |
| Last.fm matching | String-based; normalization helps, not perfect |
| Multi-disc albums | Flat tracklist |
| Offline | None |
| Shared libraries | Per-user only |
| Pipelines | Appendix A only; zero UI and zero writes in v1 |
| Playcount refresh | Manual or post-scrobble bump; scheduled sync optional later |

---

## 10. Lab-validated assumptions

Summary of what the disposable lab proved. Implement per sections 4–6 above; no external documents required.

### MusicBrainz identity

| Assumption | Result |
|------------|--------|
| Catalogue coverage | Sufficient for a MusicBrainz-first rebuild |
| Release groups alone as library album | **Insufficient** — editions differ in tracklist and date |
| Import unit | **Release** (pinned edition) |
| `albumYear` | Release group `first-release-date` |
| After import | Copy-and-sever; no live MB sync for library |
| Explorer | Release groups for browse; releases for import |

### Library model

| Assumption | Result |
|------------|--------|
| Frozen tracklist + cover at import | Works |
| `Artist` as first-class entity with `artistId` on album | Required (not display string alone) |
| `type` from RG primary-type | Useful; lowercase normalize |
| Recording MBIDs on tracks | Omit for v1 |

### YouTube resolution

| Assumption | Result |
|------------|--------|
| Separate mapping layer from album model | Correct |
| Auto-resolve accuracy | POC-grade; manual override essential |
| Cached `videoId` stable until user changes | Yes |
| Topic-biased query | Helps when Topic channels exist |
| Album title in auto-query | Often hurts; omit from default |

### Playback

| Assumption | Result |
|------------|--------|
| IFrame API against cached `videoId` | Works without re-search at play time |
| Unresolved tracks need clear UX | Yes |
| Manual mappings = auto at playback | Yes |

### Sessions

| Assumption | Result |
|------------|--------|
| Pause-excluded `listenedMs` | Works |
| 80% completion for display | Separate from scrobble threshold |
| Per-user isolation | Required |

### Last.fm

| Assumption | Result |
|------------|--------|
| Scrobble threshold `min(length/2, 4 min)` | Matches Last.fm rules |
| Scrobble timestamp = track start | Correct |
| Popup + session poll auth | Reliable when redirect fails |
| MB artist credit vs Last.fm name | Mismatches cause 0 playcounts — use `scrobbleName` |
| Rebuild bet: MB library + YouTube + Last.fm | Validated |

### Deliberately not validated in lab (iteration 1 adds)

- Firebase / Firestore persistence
- Playlists with multi-membership (lab used single global stage history — **do not replicate**)
- Server-side API proxies for secrets

---

## 11. Build plan

Implementation milestones. Track with checkboxes or issues.

### Phase 0 — Repository bootstrap

**Goal:** Runnable authenticated shell in a new repo.

- [ ] New repository scaffolded (Vue 3, TS, Vite, Tailwind, Pinia, Router)
- [ ] Firebase project: Auth, Firestore, Hosting
- [ ] Login flow; `users/{uid}` profile on first sign-in
- [ ] App layout, nav placeholders, empty routes
- [ ] CI: `npm run build` on push
- [ ] README with setup instructions

**Done when:** Sign in works; deployed empty shell loads.

**Estimate:** 1–2 days

---

### Phase 1 — MusicBrainz Explorer

**Goal:** Live browse against MusicBrainz; no import yet.

- [ ] MusicBrainz proxy (dev + production)
- [ ] Throttled client; User-Agent from settings
- [ ] Artist search, album search
- [ ] Release group view, release view, tracklist view

**Done when:** Full explorer browse works; rate limit respected. See §10 MusicBrainz identity.

**Estimate:** 3–5 days

---

### Phase 2 — Library import

**Goal:** App-owned album records in Firestore.

- [ ] `Artist` + `Album` Firestore services
- [ ] Import pipeline per §4.12
- [ ] Library list and album detail
- [ ] Artists list and detail
- [ ] Dedupe on `releaseMbid` per user

**Done when:** Import release → library album with cover, tracks, artist link. See §10 Library model.

**Estimate:** 3–5 days

---

### Phase 3 — Playlists

**Goal:** Spotify-style playlist collections.

- [ ] Playlist CRUD
- [ ] `PlaylistMembership` add, remove, reorder
- [ ] Add albums from library on playlist detail
- [ ] Multi-playlist membership (same album on A and B)
- [ ] Queue builder from playlist (playback wiring in Phase 5)

**Done when:** Playlists are independent collections; no pipeline concepts in UI.

**Estimate:** 3–4 days

---

### Phase 4 — YouTube resolution

**Goal:** Persisted track → video mappings.

- [ ] YouTube API server proxy
- [ ] `TrackYouTubeMapping` Firestore CRUD
- [ ] Auto-resolve, search panel, manual URL
- [ ] Unresolved indicators on album and playlist
- [ ] Optional resolve-all for an album

**Done when:** Mappings persist; manual override works. See §5.2 and §10 YouTube resolution.

**Estimate:** 4–6 days

---

### Phase 5 — Playback engine

**Goal:** Playback with global player.

- [ ] YouTube IFrame API player component
- [ ] Playback store per §6.3–6.4
- [ ] Play from album and playlist
- [ ] Global player bar in app shell
- [ ] Graceful handling of missing `videoId`

**Done when:** Full album and playlist playback with transport controls. See §6.4.

**Estimate:** 4–5 days

---

### Phase 6 — Session tracking

**Goal:** App-owned listen telemetry.

- [ ] `PlaybackSession` and `TrackListenRecord` Firestore writes
- [ ] Behaviour per §6.5
- [ ] `/history` screen
- [ ] Local playcount increment on completed listen

**Done when:** History reflects real listening; playcounts update locally. See §10 Sessions.

**Estimate:** 2–3 days

---

### Phase 7 — Last.fm

**Goal:** Scrobbling and playcount sync.

- [ ] Server-side auth token exchange
- [ ] Connect / disconnect UI per §5.3
- [ ] Now playing on track start
- [ ] Scrobble on listen finalize when threshold met
- [ ] Playcount refresh (Last.fm wins)
- [ ] Basic artist/title normalization

**Done when:** Scrobbles appear on Last.fm; playcounts sync for most tracks. See §5.3 and §10 Last.fm.

**Estimate:** 4–5 days

---

### Phase 8 — Polish and ship

**Goal:** Daily-driver quality.

- [ ] Home: recent listens, resume playback
- [ ] Settings polish
- [ ] Error states, loading, empty states
- [ ] Mobile-responsive player bar
- [ ] Firestore indexes and security rules audit
- [ ] Production deploy

**Done when:** Usable as primary music player.

**Estimate:** 3–5 days

---

## 12. Exit criteria (iteration 1 complete)

- [ ] Import albums from MusicBrainz into personal library
- [ ] Create playlists; same album on multiple playlists
- [ ] Resolve and play albums and playlists via YouTube
- [ ] Persistent player with queue from album or playlist
- [ ] Listen history and local playcounts
- [ ] Last.fm connect, scrobble, playcount refresh
- [ ] Appendix A pipeline model understood; no pipeline UI or writes
- [ ] This spec is the sole build reference for iteration 1

---

## 13. Suggested new-repo layout

```
tunicious/
  docs/
    Tunicious_v2_Iteration1_Specification.md
  functions/          # MB / YouTube / Last.fm proxies
  src/
    components/
      playback/
      explorer/
    layouts/
    lib/
      album/
      artist/
      musicbrainz/
      youtube/
      lastfm/
      playback/
      session/
      playlist/
    stores/
    views/
    router/
  firestore.rules
  firebase.json
```

---

## Appendix A — Pipeline data model (iteration 2)

**Status:** Defined, not implemented in iteration 1.  
**Purpose:** Ensure iteration 1 schema does not block pipelines later.

### Concepts

| Concept | What it is | Owns albums? |
|---------|------------|--------------|
| **Library** | Imported `Album` records | Album exists once imported |
| **Playlist** | User-facing collection | Yes — via `PlaylistMembership` |
| **Pipeline** | Named workflow graph | No |
| **Stage** | Node in a pipeline graph | No — references a `playlistId` |
| **StageMembership** | Album's position in a pipeline | No — workflow state only |

### Invariants

1. **Playlist membership** is many-to-many.
2. **Stage membership** is scoped per pipeline: at most one open position per `(userId, albumId, pipelineId)`.
3. An album may be in the library, on multiple playlists, and in multiple pipelines concurrently.
4. **Pipeline moves** affect stage membership and may sync stage-linked playlists — they do not evict albums from unrelated playlists.
5. Users always see **playlists** in UI. **Stages** appear only in pipeline workflow UI.

**Do not port** lab behaviour that closed all open stage entries globally on any move — iteration 2 uses per-pipeline `StageMembership` only.

### `Pipeline`

Firestore: `users/{uid}/pipelines/{pipelineId}`

| Field | Type |
|-------|------|
| `id` | string |
| `name` | string |
| `createdAt` | timestamp |
| `updatedAt` | timestamp? |

### `Stage`

Firestore: `users/{uid}/stages/{stageId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `pipelineId` | string | |
| `playlistId` | string | Album list lives on the playlist |
| `name` | string | |
| `pipelineRole` | `'source' \| 'transient' \| 'terminal' \| 'sink'` | |
| `nextStageId` | string? | Graph uses **stage** IDs, not playlist IDs |
| `terminationStageId` | string? | |
| `createdAt` | timestamp | |

Graph order: derive from traversal, not a stored list.

### `StageMembership`

Firestore: `users/{uid}/stage_memberships/{membershipId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `albumId` | string | |
| `pipelineId` | string | |
| `stageId` | string | |
| `pipelineRole` | string | Snapshot at entry |
| `addedAt` | timestamp | |
| `removedAt` | timestamp? | `null` = current in this pipeline |

### Workflow (iteration 2)

- **Advance:** Close open membership → append at `nextStageId` → sync playlist membership between stage playlists if distinct.
- **Terminate:** Same, target `terminationStageId`.
- **Undo:** Restore from history; sync playlists.
- **Add to pipeline:** Enter at source stage; does not remove other playlist memberships.

### Evaluation funnel template (iteration 2)

Ten stages — each links to its own playlist when created:

```
Queued (source)
  → Curious (transient) → Interested → Good → Excellent → Wonderful (terminal)
         ↓ on "no": 1★, 2★, 3★, 4★ (sinks)
```

| Stage | Role | On yes → | On no → |
|-------|------|----------|---------|
| Queued | source | Curious | — |
| Curious | transient | Interested | 1★ |
| Interested | transient | Good | 2★ |
| Good | transient | Excellent | 3★ |
| Excellent | transient | Wonderful | 4★ |
| Wonderful | terminal | — | — |
| 1★–4★ | sink | — | — |

### Schema impact on iteration 1 (no code in v1)

| Iteration 1 entity | Iteration 2 addition |
|--------------------|---------------------|
| `Playlist` | Unchanged |
| `PlaylistMembership` | Unchanged |
| `PlaybackSession` | Optional `sourcePipelineId` |
| New collections | `pipelines`, `stages`, `stage_memberships` |

### Differences from Spotify-era v1

| Spotify-era v1 | Tunicious v2 |
|----------------|--------------|
| Playlist doc = stage + Spotify ID | `Playlist` + `Stage.playlistId` |
| One global current stage | One open position per pipeline |
| One playlist membership implied by stage | Many playlists + pipeline position |
| Spotify playback | YouTube playback |

### Iteration 2 features (not scheduled here)

- Pipeline / stage CRUD UI
- Advance / terminate / undo
- Funnel template creation
- Smart queue generation
- Spotify → MusicBrainz migration
