# Tunicious v2 — Iteration 2b: v1 → v2 Migration

**Status:** Draft  
**Prerequisite:** [Iteration 2](Tunicious_v2_Iteration2_Specification.md) pipeline data model (Phase 0+). Evaluation funnel provisioned in v2 (Phase 1).  
**Audience:** Personal cutover from Spotify-era v1 to v2. Not a general multi-user product feature unless promoted later.

This document captures migration strategy for personal cutover from Spotify-era v1 to Tunicious v2. **v1 source constraints are confirmed** (see §2.1); playlist/stage ID mapping and rating field shapes remain to be inventoried from export.

---

## 1. Purpose

Iteration 2 ships a greenfield evaluation funnel. A v1 user already has:

- Albums organized across **stage playlists** (Queued, Curious, …) via Spotify-era tooling
- **Pipeline process metadata** — when albums moved between stages, ratings, and related dates (`playlistHistory` on v1 album docs)
- A longer **album readiness** path in v2 (library import → MusicBrainz → YouTube resolve) before playback

Iteration 2b defines how to land v1 **pipeline state** in v2 **without losing history** and **without creating conflicting v2-native pipeline records** before migration runs.

**Important:** v1 library data is **not** copied into v2. The v2 catalog was built independently via `/import` (Spotify Exportify CSV → MusicBrainz release match). Migration attaches v1 funnel history to albums that already exist in the v2 library.

### 1.1 Iteration 2b delivers (target)

- A documented **three-layer** migration model
- **Cutover rules** — what to do before/after migration on real data
- **Playlist CSV sync** spec (readiness triage, not full import) — may be built during iter 2 or 2b
- **Pipeline state migration** — one-shot import of `StageMembership` history + album rating/submission fields from v1
- **Album mapping workflow** — dry-run suggestions + human-reviewed `album-id-map.json` (see §7.2)
- Inventory of **open questions** pending full v1 export (playlist IDs, rating fields)

### 1.2 Iteration 2b does not deliver (initially)

- Automated Spotify playlist pull (Exportify CSV remains the playlist snapshot source)
- Full `AlbumRatingEvent` audit trail (iteration 3+)
- Migration UI in the app (first pass: script / admin tool + spreadsheet review for album mapping)
- Reconstructing history that v1 never persisted (playlist snapshot only)
- Fully automated v1 → v2 album matching (no shared IDs; see §7)

---

## 2. Three layers of state

Do not conflate these. Each has a different source and migration path.

| Layer | What it is | v1 source | v2 target |
|-------|------------|-----------|-----------|
| **1 — Library** | Canonical `Album` + artists + YouTube mappings | **Not migrated.** User builds v2 library via `/import` over time | Global `albums` / `artists`; per-user `album_entries` / `artist_prefs` |
| **2 — Playlist snapshot** | Which albums appear on which stage playlist **today** | Spotify Exportify CSV per stage, or v1 playlist membership | `PlaylistMembership` on stage-linked playlists |
| **3 — Pipeline state** | Current position + move history + evaluation ratings | v1 `playlistHistory[]` on album docs (+ ratings TBD) | Open + closed `StageMembership`; rating fields on `album_entries` |

### 2.1 Cross-system constraints (confirmed)

v1 and v2 are **separate databases**. No v1 data was bulk-migrated into v2.

| Topic | v1 (Spotify-era) | v2 (current) |
|-------|------------------|--------------|
| **Album IDs** | v1-owned doc IDs | v2-owned UUIDs — **no correlation** |
| **MusicBrainz** | Not stored on albums | `releaseMbid` on every imported album |
| **Spotify IDs** | May exist on playlists; not relied on for album join | Used only at CSV import time; **not stored** on `Album` |
| **Track lists** | **Not stored** on album docs | Full MB track list on `Album` |
| **Album fields** | Title, artist (and pipeline metadata) | Title, artist from MB (may differ — e.g. `(Deluxe)` stripped or different edition picked) |
| **Library build** | Spotify-era catalog | Fresh MB imports via Exportify CSV → `suggestRelease` title/artist/year scoring |

**Implication:** Layer 3 migration is a **semantic join** — “this v1 album’s funnel history belongs on this v2 album” — not a database FK remap. Wrong album links are worse than skipped history; human oversight is required for ambiguous matches (see §7.2).

**Iteration 2 alone** (CSV fill without layer 3) leaves albums on the right playlists but the app treats them as **not in the pipeline** — no submission gating, no workflow actions, incorrect rating display.

**Using iteration 2 workflow (Start/Yes/No) on real data before layer 3 migration** creates v2-native history from cutover day forward and **complicates or blocks** a later v1 history import for those albums.

---

## 3. Design principles

1. **Library first.** Albums must exist in v2 library before playlist or pipeline migration. v2 library is built via `/import`, not v1 export. Resolve tracks for playback before expecting playlist add (same rule as iteration 2 `AddAlbumPanel`).
2. **CSV sync is layer 2 only.** Re-parsing Exportify CSV matches library albums and adds playlist memberships. It does **not** write `StageMembership` or rating fields.
3. **Pipeline migration is layer 3 only.** One-shot write of membership history and album evaluation state from v1. Run on a clean pipeline namespace for affected albums where possible.
4. **Do not build history organically before migration** on the catalog you intend to import. Use throwaway accounts or post-migration albums for iteration 2 workflow testing.
5. **Idempotent where practical.** Re-running playlist CSV sync should skip albums already on the playlist. Pipeline migration should be all-or-nothing per user with an explicit cutover flag.
6. **Minimum vs full migration** — see §6. Choose based on what v1 actually stored.
7. **Album mapping is human-gated.** Auto-match may suggest candidates; apply only rows with an explicit entry in `album-id-map.json`. Never silently pick among multiple v2 candidates.

---

## 4. Recommended cutover sequence

For a v1 user moving to v2:

```
┌─────────────────────────────────────────────────────────────────┐
│  A. Library import (/import)                                     │
│     Parse CSV(s) → MB match → import → resolve YouTube          │
│     (Slow; can happen over days/weeks)                          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  B. Evaluation funnel in v2 (iteration 2 Phase 1)               │
│     Set up pipeline; map ten stages to existing or new playlists │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  C. Playlist snapshot sync (per stage CSV)                      │
│     Match library → triage resolved/unresolved → add eligible   │
│     (Repeat per stage; re-run as more albums become resolved)   │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  D. Pipeline state migration (one-shot, from v1 export)         │
│     Human-reviewed album-id-map → StageMembership chain         │
│     + album rating/submission fields on album_entries           │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  E. Live workflow enabled                                        │
│     Start/Yes/No/undo on new moves only; appends to history     │
└─────────────────────────────────────────────────────────────────┘
```

Steps A–C can overlap in time. **Do not run E on migrated albums until D completes.**

---

## 5. Layer 2 — Playlist CSV sync

*May ship during iteration 2 (playlist detail) or iteration 2b. Documented here because it is part of cutover.*

### 5.1 Behaviour

1. User selects one Exportify CSV on a **target playlist** (typically a stage playlist).
2. Parse with existing `parseSpotifyExportCsv` + `findLibraryMatch` / `markAlbumsInLibrary`.
3. Classify each row:

| Status | Condition | UI |
|--------|-----------|-----|
| **Ready** | In library, all tracks resolved | Can add |
| **Unresolved** | In library, not fully resolved | Highlight; link to album resolve |
| **Not in library** | No title/artist match | Prompt to `/import` first |
| **Already member** | On target playlist | Skip |

4. User confirms **Add N ready albums** → `addAlbumToPlaylist` only. No MusicBrainz, no track-compare panel.
5. **Does not** call enter-pipeline / `StageMembership` writes (layer 3 handles that, or iteration 2 workflow after cutover).

### 5.2 Notes

- Re-running the same CSV is expected as library resolve progresses.
- Multi-file merge on `/import` **loses stage assignment** — use one CSV per stage for snapshot sync.
- For stage playlists after cutover, adding via sync should eventually call iteration 2 enter-pipeline logic; **defer until after migration** or gate behind cutover flag.

---

## 6. Layer 3 — Pipeline state migration

### 6.1 Minimum migration (workflow-functional)

Enough for iteration 2 UI to behave correctly **today**:

Per album that was in the v1 funnel:

- One **open** `StageMembership` at the stage matching v1 current position (`removedAt: null`)
- `pipelineRole` snapshot from stage definition
- `PlaylistMembership` on that stage’s playlist (may already exist from layer 2)
- `Album` / `album_entries` fields per iteration 2 §4.6:
  - On sink/terminal: `rating`, `ratingSource: 'pipeline'`, `ratedAt` (from v1 if available)
  - On source/transient: `ratingSubmittedPipelineId` set if still in evaluation; `ratingBeforeSubmission` if stashed in v1
  - Out of funnel: clear submission fields; retain manual/pipeline rating as appropriate

### 6.2 Full migration (history-preserving)

v1 persists move events on album docs as `playlistHistory[]`. Each array entry maps to one `StageMembership` row:

| v1 `playlistHistory[]` | v2 `StageMembership` |
|------------------------|----------------------|
| (parent v1 album id) | `albumId` → **v2** id via `album-id-map.json` |
| `addedAt` | `addedAt` |
| `removedAt` (`null` = current) | `removedAt` |
| `pipelineRole` | `pipelineRole` |
| `playlistId` | → resolve to `stageId` via playlist-id map |
| — | `pipelineId` (evaluation pipeline in v2) |
| new UUID | `id` |

Migration steps:

- Reconstruct **closed** `StageMembership` rows in chronological order per `(v2AlbumId, pipelineId)`
- Each segment: `stageId`, `pipelineRole`, `addedAt`, `removedAt` from v1 timestamps
- Final segment open with `removedAt: null`
- **Require** confirmed `v1AlbumId → v2AlbumId` mapping before writing (§7.2) — v1 and v2 album IDs are unrelated

v2 schema stores history as closed memberships — no separate audit collection required for iteration 2.

### 6.3 What we cannot recover

If v1 only has **current playlist placement** (no event log):

- Full path (Queued → Curious → … with dates) is **not reconstructable**
- Minimum migration (current stage + rating) is still possible from snapshot + v1 album docs

**Scope note:** Only albums with a confirmed v2 library match **and** a row in `album-id-map.json` receive pipeline history. v1 albums not imported to v2 are skipped (or imported first, then mapped).

### 6.4 Conflict rules (draft)

| Situation | Stance |
|-----------|--------|
| Album has v2 `StageMembership` created by live workflow pre-migration | Migration skips or flags for manual review — **avoid by not using workflow pre-cutover** |
| Playlist membership exists but no v1 history | Create open membership only; no fabricated closed rows |
| Album on wrong stage playlist vs v1 current stage | v1 pipeline state wins; optionally fix playlist membership to match |
| Duplicate album on multiple stage playlists | Resolve to v1 current stage; remove other stage playlist memberships |

### 6.5 Cutover flag (proposed)

`users/{uid}` profile field, e.g. `pipelineMigrationCompletedAt: timestamp`

- While unset: iteration 2 workflow writes disabled or warned for evaluation pipeline (product decision)
- Migration script sets flag on success
- Optional: `pipelineMigrationVersion: 'v1-export-2026-…'` for support

---

## 7. v1 → v2 mapping

### 7.0 Source inventory (partial)

**v1 album doc (confirmed):**

- `id` — v1-only; not portable
- `title`, `artist` — primary matching inputs
- `playlistHistory[]` — pipeline segments (`addedAt`, `removedAt`, `pipelineRole`, `playlistId`, …)
- No MusicBrainz IDs, no track list

**v2 album doc (confirmed):**

- `id` — v2 UUID; assigned at MB import
- `title`, `artist`, `releaseMbid`, `tracks[]` — from MusicBrainz
- No Spotify album ID persisted

**Structural differences (Spotify-era v1 vs Tunicious v2):**

| Spotify-era v1 | Tunicious v2 |
|----------------|--------------|
| Playlist doc = stage + Spotify ID | `Playlist` + `Stage.playlistId` |
| One global current stage | One open `StageMembership` per pipeline |
| Stage implied playlist membership | Explicit `PlaylistMembership` + `StageMembership` |
| `playlistHistory[]` on album doc | Closed + open `StageMembership` rows |

### 7.1 ID mapping

| Entity | Strategy |
|--------|----------|
| **Album** | **No shared IDs.** Auto-**suggest** via normalized title + artist (`albumTitleMatchKeys`, `findLibraryMatch`). **Apply** only with human-confirmed `album-id-map.json`. `releaseMbid` is v2-only and cannot bridge from v1. Edition disambiguation (Deluxe vs standard, remasters) requires human review — v1 has no track list to compare. |
| **Playlist / stage** | Match evaluation template names (Queued, Curious, …); map v1 `playlistId` → v2 `stageId` / `playlistId` after funnel creation |
| **Pipeline** | Evaluation pipeline per user; `templateId: 'evaluation'` |

### 7.2 Album mapping workflow (required)

Because v1 and v2 catalogs were built independently, album mapping is a **one-time curated artifact**, not an automatic migration step.

**1. Export v1** (read-only) — see **§7.3 Export contract** for the required shape and fields.

Only export albums with `playlistHistory` worth migrating (not necessarily the full v1 library).

**2. Dry-run** — for each v1 album, query v2 global `albums` and classify:

| Bucket | Condition | Action |
|--------|-----------|--------|
| `auto_suggested` | Exactly one candidate after normalized title + artist match | Suggest for map; still review if edition qualifiers differ between v1 and v2 titles |
| `ambiguous` | Multiple v2 candidates (e.g. standard + deluxe share core title) | Review queue — show v1 title/artist beside each v2 title/artist/**track count** |
| `unmatched` | No v2 candidate | Skip pipeline import, or import album to v2 first |
| `mapped` | Row present in `album-id-map.json` | Eligible for apply |

**3. Human review** — edit `album-id-map.json`:

```json
{
  "v1AlbumId": {
    "v2AlbumId": "uuid",
    "confidence": "manual",
    "note": "v1 Deluxe title; v2 is standard MB release — same listening copy"
  }
}
```

Auto-accept **only** unambiguous single matches with matching edition intent. When in doubt, pick manually. Wrong history on the wrong album is unacceptable.

**4. Apply** — migration script writes `StageMembership` rows **only** for mapped albums. Emit report: applied / skipped-unmapped / skipped-no-v2-library.

**Supporting mapping files:**

| File | Purpose |
|------|---------|
| `album-id-map.json` | v1 album id → v2 global `albumId` (human-gated); or `migration` node on working `albums.json` |
| `playlist-id-map-{group}.json` | Spotify playlist id → inferred stage name + v2 `stageId` / `playlistId`. Derive by walking `playlists.json` graph (`nextStagePlaylistId` / `terminationPlaylistId`) per `group` — no Spotify name lookup. Examples: `playlist-id-map-new.json`, `playlist-id-map-known.json` |
| `pipeline-map.json` / uid map | v1 uid → v2 uid; v1 group → v2 `pipelineId` |

**Reference implementation for suggestions:** `src/lib/import/normalizeAlbumTitle.ts` (edition qualifier stripping), `src/lib/import/matchLibrary.ts` (title + artist index). These match how v2 library was built from CSV — they are **suggestion helpers**, not authoritative matchers across systems.

### 7.3 v1 export contract (for the v1 app)

v1 must produce a **read-only JSON export**. No writes to v1. No MusicBrainz / Spotify enrichment required — export what is already on the album docs.

#### Scope

- Export albums that have a non-empty `playlistHistory` (or equivalent move-history array).
- Optionally also export a small **playlist catalog** so v2 can build `playlist-id-map.json`.
- Do **not** require track lists, MBIDs, or Spotify album IDs (v1 does not have them for this join).

#### Recommended layout

```
exports/v1-pipeline-YYYY-MM-DD/
  manifest.json
  albums.json                 # or albums/{v1AlbumId}.json (one file per album)
  playlists.json              # optional but recommended
```

#### `manifest.json`

```json
{
  "exportedAt": "2026-07-10T12:00:00.000Z",
  "source": "tunicious-v1",
  "uid": "<firebase-auth-uid>",
  "albumCount": 0,
  "playlistCount": 0,
  "notes": "Pipeline history export for Tunicious v2 iteration 2b"
}
```

#### Album record (required)

Each album object **must** include:

| Field | Type | Notes |
|-------|------|-------|
| `v1AlbumId` | string | Firestore document id |
| `title` | string | Exact stored title (do not normalize/strip Deluxe etc.) |
| `artist` | string | Primary album artist string as stored |
| `playlistHistory` | array | Chronological segments; see below |

**Include if present on the album doc** (do not invent):

| Field | Type | Notes |
|-------|------|-------|
| `rating` | number | Star rating if stored |
| `ratedAt` | string (ISO) | |
| `ratingSource` | string | |
| `year` | string/number | Helps human review only |
| `imageUrl` | string | Optional, review UI only |
| Any other rating / submission / “current stage” fields | — | Export as-is under a `extras` object if names are unclear |

#### `playlistHistory[]` entry (required fields)

Preserve every segment. Serialize Firestore Timestamps as **ISO-8601 strings** (or `{ "_seconds": n, "_nanoseconds": n }` — pick one and document it in `manifest.json`).

| Field | Type | Required | Maps to v2 |
|-------|------|----------|------------|
| `addedAt` | ISO string / timestamp | **yes** | `StageMembership.addedAt` |
| `removedAt` | ISO string / timestamp / `null` | **yes** (`null` = current open segment) | `StageMembership.removedAt` |
| `playlistId` | string | **yes** | → `stageId` via playlist map |
| `pipelineRole` | string | yes if stored | `pipelineRole` |
| `playlistName` | string | recommended | Human review / stage name match |
| `category` | string | if stored | Review / mapping aid |

Export **all other keys** on each history entry as-is (do not drop unknown fields). Order array chronologically by `addedAt` ascending if not already ordered.

#### `playlists.json` (recommended)

One row per stage / evaluation playlist referenced by history:

```json
[
  {
    "v1PlaylistId": "...",
    "name": "Curious",
    "pipelineRole": "transient",
    "spotifyPlaylistId": "..."
  }
]
```

`name` + `pipelineRole` are enough for v2 to map Queued / Curious / … → stages. Spotify playlist id is optional.

#### Filtering rules

1. Skip albums with missing/empty `playlistHistory`.
2. Do not rewrite titles or merge editions.
3. Do not resolve or change `playlistId` values — export raw v1 ids.
4. Prefer one downloadable zip or a single `albums.json` array for handoff to v2.

#### Acceptance check (v1)

- [ ] Sample album JSON opens and has `v1AlbumId`, `title`, `artist`, `playlistHistory`
- [ ] At least one history entry has `removedAt: null` (current stage) when album is still in funnel
- [ ] Closed segments have both `addedAt` and `removedAt`
- [ ] Timestamps are parseable (ISO or documented Firestore shape)
- [ ] `playlists.json` covers every distinct `playlistId` appearing in history (or list gaps)

---

## 8. Relationship to iteration 2

| Iteration 2 item | Migration interaction |
|------------------|----------------------|
| Phase 1 — Set up funnel | Required before layer 2–3; map stages to playlists with existing memberships |
| Phase 3 — Workflow engine | Do not use on production catalog until layer 3 complete |
| Phase 4 — Ratings UI | Display depends on migrated `Album` fields |
| §1.2 Spotify migration out of scope | Refers to **automated** Spotify pull; this spec covers **manual** CSV + v1 export |

Iteration 2 spec §1.2 links here for personal v1 cutover.

---

## 9. Build plan (draft)

| Phase | Summary | Depends on |
|-------|---------|------------|
| **0 — v1 export** | Export v1 album docs with `playlistHistory`; document playlist/rating field shapes | v1 access |
| **1 — Playlist CSV sync** | Triage UI + bulk add (layer 2) | Iter 2 funnel playlists |
| **2a — Album mapping** | Dry-run suggestions → human review on `/migration` (Firestore staging) | Phase 0, v2 library populated |
| **2b — Migration apply** | Mapped staging albums → v2 `StageMembership` writes via Migration page | Phase 2a, playlist-id-map linked |
| **3 — Cutover** | Run apply script on prod user; set flag; smoke-test workflow | Phases 1–2b |
| **4 — (Optional) In-app migration** | Wizard wrapping export + mapping review + apply | Phase 2b proven |

Album mapping effort scales with **albums that have v1 `playlistHistory`**, not total v2 library size.

---

## 10. Exit criteria (draft)

- [ ] v1 album + `playlistHistory` shape documented (§7.0)
- [ ] v2 library contains albums needed for pipeline import (layer 1 via `/import`, not v1 copy)
- [ ] `album-id-map.json` reviewed and complete for target albums
- [ ] Stage playlists contain expected albums (layer 2)
- [ ] Open `StageMembership` matches v1 current stage per in-funnel album
- [ ] Closed history rows imported **or** consciously skipped with documented reason
- [ ] Album ratings and submission fields match v1 for sink/terminal/in-progress albums
- [ ] No pre-migration v2 workflow history on migrated albums
- [ ] Start/Yes/No works on a newly queued album post-cutover
- [ ] Cutover flag set

---

## 11. Open questions (revisit)

### Resolved / confirmed

1. **Separate databases** — v1 and v2 have no shared album (or other catalog) IDs.
2. **v1 album shape** — title, artist, `playlistHistory[]` only; no MBIDs, no track list.
3. **v2 library origin** — built via `/import` (CSV title/artist → MB); no v1 bulk migration.
4. **Album matching** — human-gated `album-id-map.json`; auto-suggest title+artist only.

### Still open

1. **Exact v1 fields** on `playlistHistory[]` entries and any per-album rating / submission fields.
2. Does v1 store **per-album rating** on sinks only, or tentative ratings on transients?
3. v1 Firebase project vs v2 — same `uid`?
4. Should playlist CSV sync live on iteration 2 roadmap or only 2b?
5. Fabricate `addedAt` on open membership when v1 date unknown, or use migration run time?
6. Albums in v1 library but not in any stage playlist — leave out of pipeline entirely?
7. Playcount / listen history — iteration 1 layer; separate from pipeline migration (confirm no v1 coupling)?

---

## 12. References

- [Iteration 2 Specification](Tunicious_v2_Iteration2_Specification.md) — pipeline model, ratings, workflow
- [Iteration 1 Specification — Appendix A](Tunicious_v2_Iteration1_Specification.md) — v1 vs v2 pipeline concepts
- `src/lib/import/normalizeAlbumTitle.ts` — edition qualifier stripping for match suggestions
- `src/lib/import/matchLibrary.ts` — CSV → library matching (layer 2 and album-map suggestions)
- `src/lib/import/suggestRelease.ts` — how v2 picked MB releases at import time
- `src/lib/pipeline/stageMembership.ts` — layer 3 target writes
