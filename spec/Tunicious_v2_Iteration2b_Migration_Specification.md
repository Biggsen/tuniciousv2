# Tunicious v2 — Iteration 2b: v1 → v2 Migration

**Status:** Draft  
**Prerequisite:** [Iteration 2](Tunicious_v2_Iteration2_Specification.md) pipeline data model (Phase 0+). Evaluation funnel provisioned in v2 (Phase 1).  
**Audience:** Personal cutover from Spotify-era v1 to v2. Not a general multi-user product feature unless promoted later.

This document captures migration strategy discussed alongside iteration 2 planning. It is **not exhaustive** — source schema inventory, field mapping, and tooling details will be revisited once v1 Firestore exports are inspected.

---

## 1. Purpose

Iteration 2 ships a greenfield evaluation funnel. A v1 user already has:

- Albums organized across **stage playlists** (Queued, Curious, …) via Spotify-era tooling
- **Pipeline process metadata** — when albums moved between stages, ratings, and related dates
- A longer **album readiness** path in v2 (library import → MusicBrainz → YouTube resolve) before playback

Iteration 2b defines how to land v1 state in v2 **without losing history** and **without creating conflicting v2-native pipeline records** before migration runs.

### 1.1 Iteration 2b delivers (target)

- A documented **three-layer** migration model
- **Cutover rules** — what to do before/after migration on real data
- **Playlist CSV sync** spec (readiness triage, not full import) — may be built during iter 2 or 2b
- **Pipeline state migration** — one-shot import of `StageMembership` history + album rating/submission fields from v1
- Inventory of **open questions** pending v1 export analysis

### 1.2 Iteration 2b does not deliver (initially)

- Automated Spotify playlist pull (Exportify CSV remains the playlist snapshot source)
- Full `AlbumRatingEvent` audit trail (iteration 3+)
- Migration UI in the app (first pass may be a script / admin tool)
- Reconstructing history that v1 never persisted (playlist snapshot only)

---

## 2. Three layers of state

Do not conflate these. Each has a different source and migration path.

| Layer | What it is | v1 source (expected) | v2 target |
|-------|------------|----------------------|-----------|
| **1 — Library** | Canonical `Album` + artists + YouTube mappings | v1 library or re-import via `/import` | `users/{uid}/albums`, artists, mappings |
| **2 — Playlist snapshot** | Which albums appear on which stage playlist **today** | Spotify Exportify CSV per stage, or v1 playlist membership | `PlaylistMembership` on stage-linked playlists |
| **3 — Pipeline state** | Current position + move history + evaluation ratings | v1 stage / pipeline process docs (TBD) | Open + closed `StageMembership`; `Album.rating*` fields |

**Iteration 2 alone** (CSV fill without layer 3) leaves albums on the right playlists but the app treats them as **not in the pipeline** — no submission gating, no workflow actions, incorrect rating display.

**Using iteration 2 workflow (Start/Yes/No) on real data before layer 3 migration** creates v2-native history from cutover day forward and **complicates or blocks** a later v1 history import for those albums.

---

## 3. Design principles

1. **Library first.** Albums must exist in v2 library before playlist or pipeline migration. Resolve tracks for playback before expecting playlist add (same rule as iteration 2 `AddAlbumPanel`).
2. **CSV sync is layer 2 only.** Re-parsing Exportify CSV matches library albums and adds playlist memberships. It does **not** write `StageMembership` or rating fields.
3. **Pipeline migration is layer 3 only.** One-shot write of membership history and album evaluation state from v1. Run on a clean pipeline namespace for affected albums where possible.
4. **Do not build history organically before migration** on the catalog you intend to import. Use throwaway accounts or post-migration albums for iteration 2 workflow testing.
5. **Idempotent where practical.** Re-running playlist CSV sync should skip albums already on the playlist. Pipeline migration should be all-or-nothing per user with a explicit cutover flag.
6. **Minimum vs full migration** — see §6. Choose based on what v1 actually stored.

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
│     StageMembership chain + album rating/submission fields      │
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
- `Album` fields per iteration 2 §4.6:
  - On sink/terminal: `rating`, `ratingSource: 'pipeline'`, `ratedAt` (from v1 if available)
  - On source/transient: `ratingSubmittedPipelineId` set if still in evaluation; `ratingBeforeSubmission` if stashed in v1
  - Out of funnel: clear submission fields; retain manual/pipeline rating as appropriate

### 6.2 Full migration (history-preserving)

If v1 persisted move events:

- Reconstruct **closed** `StageMembership` rows in chronological order per `(albumId, pipelineId)`
- Each segment: `stageId`, `pipelineRole`, `addedAt`, `removedAt` from v1 timestamps
- Final segment open with `removedAt: null`
- Map v1 album IDs → v2 album IDs (release MBID, title/artist, or explicit mapping table)

v2 schema stores history as closed memberships — no separate audit collection required for iteration 2.

### 6.3 What we cannot recover

If v1 only has **current playlist placement** (no event log):

- Full path (Queued → Curious → … with dates) is **not reconstructable**
- Minimum migration (current stage + rating) is still possible from snapshot + v1 album docs

**Action item:** Export v1 Firestore and inventory collections/fields before finalizing §6.2 mapping.

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

## 7. v1 → v2 mapping (preliminary)

Pending v1 export. Expected differences from iteration 1 Appendix A:

| Spotify-era v1 | Tunicious v2 |
|----------------|--------------|
| Playlist doc = stage + Spotify ID | `Playlist` + `Stage.playlistId` |
| One global current stage | One open `StageMembership` per pipeline |
| Stage implied playlist membership | Explicit `PlaylistMembership` + `StageMembership` |
| (TBD) move timestamps / history collection | Closed `StageMembership` rows |

### 7.1 ID mapping

| Entity | Strategy |
|--------|----------|
| Album | Prefer `releaseMbid` match; fallback title+artist; maintain `v1AlbumId → v2AlbumId` map for failures |
| Playlist / stage | Match evaluation template names (Queued, Curious, …); map v1 playlist/stage IDs to v2 `stageId` / `playlistId` after funnel creation |
| Pipeline | Single evaluation pipeline per user (`templateId: 'evaluation'`) |

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
| **0 — v1 inventory** | Export Firestore; document collections, sample docs, move history shape | v1 access |
| **1 — Playlist CSV sync** | Triage UI + bulk add (layer 2) | Iter 2 funnel playlists |
| **2 — Migration script** | v1 export → v2 writes (layer 3); dry-run report | Phase 0, iter 2 Phase 0 |
| **3 — Cutover** | Run script on prod user; set flag; smoke-test workflow | Phases 1–2 |
| **4 — (Optional) In-app migration** | Wizard wrapping script steps | Phase 2 proven |

Estimates deferred until v1 inventory completes.

---

## 10. Exit criteria (draft)

- [ ] v1 Firestore schema documented with field mapping to v2
- [ ] Library albums in v2 match v1 catalog (or accepted subset)
- [ ] Stage playlists contain expected albums (layer 2)
- [ ] Open `StageMembership` matches v1 current stage per in-funnel album
- [ ] Closed history rows imported **or** consciously skipped with documented reason
- [ ] Album ratings and submission fields match v1 for sink/terminal/in-progress albums
- [ ] No pre-migration v2 workflow history on migrated albums
- [ ] Start/Yes/No works on a newly queued album post-cutover
- [ ] Cutover flag set

---

## 11. Open questions (revisit)

1. **Exact v1 collections** for stage moves, ratings, and timestamps — names and shapes?
2. Does v1 store **per-album rating** on sinks only, or tentative ratings on transients?
3. Same Firebase project or separate? Same `uid`?
4. Should playlist CSV sync live on iteration 2 roadmap or only 2b?
5. Fabricate `addedAt` on open membership when v1 date unknown, or use migration run time?
6. Albums in v1 library but not in any stage playlist — leave out of pipeline entirely?
7. Playcount / listen history — iteration 1 layer; separate from pipeline migration (confirm no v1 coupling)?

---

## 12. References

- [Iteration 2 Specification](Tunicious_v2_Iteration2_Specification.md) — pipeline model, ratings, workflow
- [Iteration 1 Specification — Appendix A](Tunicious_v2_Iteration1_Specification.md) — v1 vs v2 pipeline concepts
- `src/lib/import/matchLibrary.ts` — CSV → library matching for layer 2
- `src/lib/pipeline/stageMembership.ts` — layer 3 target writes
