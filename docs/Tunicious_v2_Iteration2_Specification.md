# Tunicious v2 — Iteration 2 Specification

**Status:** In progress (Phase 0 complete)  
**Prerequisite:** [Iteration 1](Tunicious_v2_Iteration1_Specification.md) complete (Phases 0–8).  
**Scope:** Evaluation funnel (pipelines, stages, ratings). Custom pipeline editing and smart queue are **deferred** — see §1.2 and §12.

This document is **self-contained** for iteration 2 implementation. Pipeline concepts were sketched in iteration 1 Appendix A; this spec supersedes that appendix for build purposes.

### Build progress

| Phase | Status | Summary |
|-------|--------|---------|
| 0 — Data model & services | Complete | Pipeline, Stage, StageMembership, Album rating fields |
| 1 — Evaluation template bootstrap | Not started | One-click create funnel + 10 playlists |
| 2 — Playlist grouping UI | Not started | Collapsible pipeline group on `/playlists` |
| 3 — Pipeline workflow engine | Not started | Enter, move, yes/no, start, undo, playlist sync |
| 4 — Rating & submission | Not started | Manual stars, submission, auto-rate, display states |
| 5 — Polish & exit criteria | Not started | Edge cases, rules audit, indexes |

---

## 1. Purpose

Add an **evaluation funnel** to Tunicious v2: albums move through named stages (backed by playlists), users advance with **Start** / **Yes** / **No**, and **rated exits** (sinks and terminal) write **star ratings** to the library.

Iteration 2 builds on the iteration 1 player (library, playlists, YouTube playback, sessions, Last.fm). Playback behaviour is unchanged except optional `sourcePipelineId` on sessions.

### 1.1 Iteration 2 delivers

- **Evaluation pipeline** — one-click template (fixed 10-stage graph + playlists)
- **Pipeline workflow** — stage membership, moves, playlist sync, one-level undo
- **Album ratings** — manual 1–5 outside the funnel; submission + auto-rate inside
- **Playlists UI** — pipeline stage playlists grouped in a collapsible section; workflow actions on playlist detail rows

### 1.2 Iteration 2 does not deliver

- **Custom pipeline editor** (user-defined graphs, multiple sources, arbitrary wiring) — defer; data model stays generic for later
- **Non-evaluation workflow pipelines** — defer (schema supports later)
- **Smart queue** playlist playback mode — iteration 3
- **Dedicated `/evaluation` route** — navigation stays under `/playlists`
- **Spotify migration** — out of scope (see iteration 1 `/import`)
- **Yes/No/Start on album detail** — actions only on stage playlist views (avoids conflicts when multiple pipelines exist later)

### 1.3 Design principles

1. **Playlist** remains the user-facing collection primitive. Album lists live on playlists.
2. **Stage** is workflow metadata; it **references** a `playlistId`. Stages are not album stores.
3. **Stage roles** (`source`, `transient`, `sink`, `terminal`) describe workflow semantics, not ratings. Stars are optional **exit metadata** on sink/terminal stages (`outcomeRating`).
4. **An evaluation pipeline** is any pipeline whose graph includes **at least one** stage with `outcomeRating` set. The MVP ships one fixed template where all sinks and the terminal are rated.
5. **Rating submission** applies only when entering an **evaluation** pipeline. The user agrees the funnel may control `Album.rating` on rated exits.
6. **Do not infer rating from playlist membership alone.** Only manual edits and explicit auto-rate on rated exits set stars.
7. **At most one open stage** per `(userId, albumId, pipelineId)`. An album may be in **multiple pipelines** concurrently (data model); iteration 2 UI only ships the evaluation funnel.
8. **At most one evaluation pipeline** per user at a time.
9. **Do not port** Spotify-era v1 behaviour: one global stage, playlist doc = stage, or closing all stage entries on any move.

---

## 2. Technology stack

Unchanged from iteration 1 (Vue 3, TypeScript, Vite, Tailwind 4, Pinia, Vue Router, Firebase Auth, Firestore, Hosting). No new external APIs.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Vue 3 SPA (Pinia)                             │
│  … │ Playlists (+ pipeline group) │ Library (ratings) │ Player … │
└──────────┬───────────────────────────────┬───────────────────────┘
           │                               │
     Firestore reads/writes          Existing proxies (unchanged)
     pipelines / stages /
     stage_memberships / albums
```

### 3.1 Core flows

**Create evaluation funnel**  
Playlists screen → “Create evaluation funnel” → one `Pipeline`, ten `Playlist`s, ten `Stage`s, graph wired per §6.3. Only if user has no existing evaluation pipeline.

**Enter evaluation**  
Add album to **any** stage playlist of the evaluation pipeline (typically **Queued**). Creates `PlaylistMembership` + open `StageMembership`. If pipeline is evaluation: **submission** flow (§7). Moving to a different stage playlist **moves** the album in the pipeline (one stage at a time).

**Start evaluation**  
On **Queued** playlist detail: per-album **Start** → advance to `nextStageId` (Curious). Source stages use **Start/Next** only — no Yes/No.

**Evaluate (transient)**  
On transient playlist detail: per-album **Yes** → `nextStageId`; **No** → `terminationStageId` (sink). Sync playlist membership between stage playlists.

**Rated exit**  
Land on sink or terminal with `outcomeRating` → set `Album.rating` from stage. Clear active submission flag; album remains on that stage playlist (still “in pipeline” for manual rating purposes).

**Manual rating**  
Album detail / library: user sets 1–5 when album is **not** on any evaluation stage playlist. Disabled while in the evaluation pipeline.

**Leave evaluation**  
Remove album from a stage playlist (no dedicated “Cancel evaluation”). Rating behaviour depends on stage role (§7.4).

**Undo**  
One level only: revert last Yes/No/Start move. If undo leaves a rated sink/terminal, **clear** `Album.rating` (album returns to transient — not `ratingBeforeSubmission`).

**Delete pipeline**  
Remove pipeline + stage docs; **keep** playlists. Close open `StageMembership`s; evaluation rating cleanup per §7.5.

**Play stage playlist**  
Unchanged from iteration 1: membership order, expand tracks, YouTube queue.

---

## 4. Data model

### 4.1 Conventions

Same as iteration 1: TypeScript ↔ Firestore shapes, `users/{uid}/…`, UUID v4 client IDs.

### 4.2 `Pipeline`

Firestore: `users/{uid}/pipelines/{pipelineId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `name` | string | e.g. `Evaluation` |
| `templateId` | `'evaluation'`? | Set for one-click template |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp? | |

**Evaluation detection:** Pipeline is **evaluation** if any linked `Stage` has `outcomeRating` set. Template creation always sets ratings on all sinks + terminal.

**Constraint:** One evaluation pipeline per user (`templateId === 'evaluation'` or equivalent query).

### 4.3 `Stage`

Firestore: `users/{uid}/stages/{stageId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `pipelineId` | string | |
| `playlistId` | string | Album list lives on this playlist |
| `name` | string | Display + default playlist name |
| `pipelineRole` | `'source' \| 'transient' \| 'terminal' \| 'sink'` | |
| `nextStageId` | string? | Yes / Start target. Graph uses stage IDs |
| `terminationStageId` | string? | No target (transients only) |
| `outcomeRating` | `1 \| 2 \| 3 \| 4 \| 5`? | Sink + terminal only. When set, landing here auto-rates |
| `createdAt` | timestamp | |

**Role rules (validation for future custom editor; template is pre-valid):**

| Role | `nextStageId` | `terminationStageId` | `outcomeRating` |
|------|---------------|----------------------|-----------------|
| source | Required | — | — |
| transient | Required | Required (sink) | — |
| sink | — | — | Optional |
| terminal | — | — | Optional |

**Advancement UI:**

| Role | User action |
|------|-------------|
| source | **Start** / **Next** → `nextStageId` |
| transient | **Yes** → `nextStageId`; **No** → `terminationStageId` |
| sink, terminal | No advance actions (exit states) |

### 4.4 `StageMembership`

Firestore: `users/{uid}/stage_memberships/{membershipId}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `albumId` | string | |
| `pipelineId` | string | |
| `stageId` | string | |
| `pipelineRole` | string | Snapshot at entry |
| `addedAt` | timestamp | |
| `removedAt` | timestamp? | `null` = current position in this pipeline |

**Invariant:** At most one open membership per `(userId, albumId, pipelineId)`.

### 4.5 `Playlist` (iteration 2 addition)

Iteration 1 fields unchanged. Optional:

| Field | Type | Notes |
|-------|------|-------|
| `pipelineId` | string? | Denormalized for grouping UI; set when created as stage playlist |

Stage-linked playlists appear under the pipeline’s collapsible group on `/playlists`. User may still rename description; avoid breaking stage ↔ playlist link.

### 4.6 `Album` (iteration 2 additions)

Existing iteration 1 fields unchanged. Add:

| Field | Type | Notes |
|-------|------|-------|
| `rating` | `1 \| 2 \| 3 \| 4 \| 5`? | Canonical display rating |
| `ratingSource` | `'manual' \| 'pipeline'`? | How current `rating` was set |
| `ratingSubmittedPipelineId` | string? | Non-null while album is on any stage playlist of this evaluation pipeline |
| `ratingBeforeSubmission` | `1 \| 2 \| 3 \| 4 \| 5`? | Stashed on submission; restored on transient/source exit |
| `ratedAt` | timestamp? | Last time `rating` was written |

**In pipeline (evaluation):** `ratingSubmittedPipelineId` set from first add to any stage playlist until removed from **all** evaluation stage playlists (or pipeline deleted).

### 4.7 `PlaybackSession` (optional)

| Field | Type | Notes |
|-------|------|-------|
| `sourcePipelineId` | string? | When queue built from a stage playlist |

---

## 5. Evaluation funnel template

One-click **Create evaluation funnel** provisions:

| Step | Creates |
|------|---------|
| 1 | `Pipeline` (`name`: Evaluation, `templateId`: `evaluation`) |
| 2 | Ten `Playlist`s (one per stage) |
| 3 | Ten `Stage`s with `playlistId`, roles, edges, `outcomeRating` on sinks + terminal |

### 5.1 Graph

```
Queued (source)
  → Curious (transient) → Interested → Good → Excellent → Wonderful (terminal, 5★)
         ↓ on "no": 1★, 2★, 3★, 4★ (sinks)
```

| Stage | Role | `nextStageId` | `terminationStageId` | `outcomeRating` |
|-------|------|---------------|----------------------|-----------------|
| Queued | source | Curious | — | — |
| Curious | transient | Interested | 1★ stage | — |
| Interested | transient | Good | 2★ stage | — |
| Good | transient | Excellent | 3★ stage | — |
| Excellent | transient | Wonderful | 4★ stage | — |
| Wonderful | terminal | — | — | 5 |
| 1★ | sink | — | — | 1 |
| 2★ | sink | — | — | 2 |
| 3★ | sink | — | — | 3 |
| 4★ | sink | — | — | 4 |

### 5.2 Playlist naming

Default playlist names match stage names (e.g. `Queued`, `Curious`, `1★`, `Wonderful`). `Playlist.pipelineId` set for UI grouping.

### 5.3 Re-evaluation

No single-pass lock. User may remove album from sink/terminal (rating **retained**), then add back to **Queued**. Submission rules apply again (confirm if `rating` set; stash `ratingBeforeSubmission`).

---

## 6. Workflow engine

### 6.1 Entering the pipeline

Triggered by **adding album to a stage playlist** (same UX as iteration 1 playlist add).

1. Ensure `PlaylistMembership` on target playlist.
2. Close any open `StageMembership` for `(albumId, pipelineId)` at a **different** stage (move).
3. Open new `StageMembership` at target `stageId`.
4. If pipeline is **evaluation**:
   - If `rating` already set → confirm submission (may overwrite on next rated exit).
   - Set `ratingBeforeSubmission` from current `rating` (or null).
   - Set `ratingSubmittedPipelineId` = `pipelineId`.
5. If target stage has `outcomeRating` (direct drop on sink/terminal) → apply auto-rate (§7.3).

### 6.2 Moves (Start / Yes / No)

Atomic per album:

1. Close current open `StageMembership` (`removedAt` = now).
2. Open new membership at target stage.
3. **Playlist sync:** Remove `PlaylistMembership` from previous stage’s playlist; add to new stage’s playlist (when distinct).
4. If new stage has `outcomeRating` → auto-rate (§7.3).

### 6.3 Start (source only)

From **Queued** playlist detail: **Start evaluation** → `nextStageId` (Curious). Does not apply a rating.

### 6.4 Undo

- **Depth:** Last step only.
- Reopen previous `StageMembership`; close current; sync playlists.
- If undo moves **out of** a rated sink/terminal → **clear** `Album.rating` and `ratingSource` (album is transient again; submission remains active).
- Do **not** restore `ratingBeforeSubmission` on undo (that is for playlist removal / pipeline delete only).

### 6.5 Playlist removal (leaving the pipeline)

User removes album from a stage playlist (no separate cancel action).

| Current stage role | `Album.rating` | `ratingBeforeSubmission` | `ratingSubmittedPipelineId` |
|--------------------|----------------|--------------------------|----------------------------|
| source or transient | Restore from `ratingBeforeSubmission` | Clear stash | Clear if no other evaluation stage membership |
| sink or terminal | **Retain** auto-rated value | Clear stash | Clear if fully out of pipeline |

Close `StageMembership` when album is removed from that stage’s playlist and not present on another stage playlist of the same pipeline.

### 6.6 Delete pipeline

1. Delete all `Stage` docs and `Pipeline` doc.
2. **Keep** all stage-linked `Playlist`s (and their memberships).
3. Close all open `StageMembership`s for this `pipelineId`.
4. For each affected album in evaluation cleanup:
   - If closed while on **source/transient** → restore `ratingBeforeSubmission`; clear submission fields.
   - If closed while on **sink/terminal** → retain `rating`.

Confirm dialog recommended: pipeline removed, playlists kept, in-progress evaluations may restore prior ratings.

---

## 7. Rating

### 7.1 Manual rating

- **Where:** Album detail and library views.
- **When:** Album is **not** on any playlist belonging to the active evaluation pipeline (`ratingSubmittedPipelineId` null, or not on any of that pipeline’s stage playlists).
- **Write:** `rating`, `ratingSource: 'manual'`, `ratedAt`.

### 7.2 Submission

When album enters an **evaluation** pipeline (add to any stage playlist):

1. If `rating` is set → modal: evaluation may overwrite rating on rated exit.
2. `ratingBeforeSubmission` ← current `rating` (or null).
3. `ratingSubmittedPipelineId` ← `pipelineId`.

While submitted and on any evaluation stage playlist: **manual rating disabled.**

### 7.3 Auto-rate

When album **lands** on a stage with `outcomeRating` (move, Yes/No, Start chain, or direct add to sink/terminal playlist):

```
rating ← stage.outcomeRating
ratingSource ← 'pipeline'
ratedAt ← now
```

Does not clear `ratingSubmittedPipelineId` until album leaves all evaluation stage playlists.

### 7.4 Display states

| State | Condition | Stars UI | Extra |
|-------|-----------|----------|-------|
| **Unrated** | No `rating`; not in evaluation | Empty | — |
| **Manual** | `rating` set; not in evaluation | Filled 1–5; editable | Optional “Your rating” |
| **In evaluation** | On source/transient stage playlist | Empty or hidden; not editable | Stage badge, e.g. “Evaluating · Curious” |
| **Rated in pipeline** | On sink/terminal playlist with `rating` | Filled 1–5; not editable | Optional “From evaluation” |
| **Rated, out of pipeline** | `rating` set; left all stage playlists | Filled 1–5; editable if manual re-rate allowed | Same as manual |

**No tentative star count** during transients.

### 7.5 Rating vs stage role (summary)

| Stage role | Contributes `outcomeRating`? | While album is here |
|------------|------------------------------|---------------------|
| source | No | Submitted; no auto-rate |
| transient | No | Submitted; no auto-rate |
| sink | Yes (template) | Auto-rate on land; manual disabled |
| terminal | Yes (template) | Auto-rate on land; manual disabled |

---

## 8. UI

### 8.1 Routes

No new top-level routes required. Extend existing:

| Route | Iteration 2 changes |
|-------|---------------------|
| `/playlists` | “Create evaluation funnel” at top; collapsible **Evaluation** group with stage playlists; flat list for other playlists |
| `/playlists/:id` | If stage playlist: per-row **Start** (Queued), **Yes** / **No** (transients), **Undo** (last step) |
| `/library`, `/library/:id` | Star rating display + manual edit when allowed |

### 8.2 Playlists list

```
[ Create evaluation funnel ]     ← only if no evaluation pipeline exists

▼ Evaluation                     ← collapsible; not a playlist
    Queued
    Curious
    …
    Wonderful
    1★ … 4★

My other playlist
Another playlist
```

### 8.3 Workflow actions

- **Only on stage playlist detail** — not on album detail (future-proof for multiple pipelines).
- **Play** unchanged — normal playlist playback in membership order.

### 8.4 Delete evaluation pipeline

Control on Playlists screen when pipeline exists (e.g. pipeline group header menu). Triggers §6.6.

---

## 9. Security & indexes

### 9.1 Firestore rules

Extend iteration 1 rules: `pipelines`, `stages`, `stage_memberships` under `users/{uid}` — read/write when `request.auth.uid == uid`.

### 9.2 Suggested indexes

| Collection | Fields | Use |
|------------|--------|-----|
| `stage_memberships` | `pipelineId`, `removedAt`, `albumId` | Open memberships per pipeline |
| `stage_memberships` | `albumId`, `pipelineId`, `removedAt` | Album position lookup |
| `stages` | `pipelineId` | Stages for pipeline / playlist grouping |
| `pipelines` | `templateId` | Enforce one evaluation pipeline |

---

## 10. Known limitations (accept for iteration 2)

| Area | Stance |
|------|--------|
| Custom pipeline graphs | Not shipped; schema generic for later |
| Workflow (non-rating) pipelines | Deferred |
| Smart queue playback | Iteration 3 |
| Multiple evaluation pipelines | One per user |
| Workflow actions on album detail | Deferred intentionally |
| Rating history / audit log | Single current `rating` only |
| Spotify playlist import → funnel | Use iteration 1 import + manual add to Queued |

---

## 11. Build plan

### Phase 0 — Data model & services

- Firestore types and CRUD for `Pipeline`, `Stage`, `StageMembership`
- Extend `Album` with rating fields; migration-safe defaults (null)
- Pipeline service: evaluation detection, open membership queries
- Unit-test workflow transitions where practical

**Done when:** Can create/read pipeline graph and memberships in Firestore from services.

**Estimate:** 2–3 days

---

### Phase 1 — Evaluation template bootstrap

- “Create evaluation funnel” on `/playlists`
- Template writer: pipeline + 10 playlists + 10 stages + edges + `outcomeRating`
- Enforce one evaluation pipeline per user

**Done when:** Button creates full funnel; stage playlists have `pipelineId`.

**Estimate:** 1–2 days

---

### Phase 2 — Playlist grouping UI

- Collapsible Evaluation group on `/playlists`
- Flat list for non-pipeline playlists
- Delete pipeline affordance + confirm dialog

**Done when:** Stage playlists nest under group; other playlists unchanged.

**Estimate:** 1–2 days

---

### Phase 3 — Pipeline workflow engine

- Add to stage playlist → enter / move + membership sync
- Start (Queued), Yes/No (transients), one-level Undo
- Remove from playlist → leave rules (§6.5)

**Done when:** Full funnel walk works without ratings UI.

**Estimate:** 3–5 days

---

### Phase 4 — Rating & submission

- Manual stars on library / album detail (gated)
- Submission confirm + stash on evaluation enter
- Auto-rate on `outcomeRating` land
- Display states (§7.4)

**Done when:** Manual, submitted, auto-rated, and in-evaluation displays match spec.

**Estimate:** 2–3 days

---

### Phase 5 — Polish & ship

- `sourcePipelineId` on playback sessions (optional)
- Firestore rules + indexes deploy
- Edge cases: re-queue, delete pipeline, direct drop on sink
- README update

**Done when:** §12 exit criteria met.

**Estimate:** 2–3 days

---

## 12. Exit criteria (iteration 2 complete)

- [ ] User can create evaluation funnel once (10 stage playlists)
- [ ] Stage playlists appear in collapsible group on `/playlists`
- [ ] Add album to Queued → submission; Start → Curious
- [ ] Yes/No through transients; lands on correct sink or Wonderful
- [ ] Auto-rate on sink/terminal; manual rating disabled while in funnel
- [ ] Manual rating on library/album when not in funnel
- [ ] Remove from transient/source restores `ratingBeforeSubmission`
- [ ] Remove from sink/terminal retains rating
- [ ] One-level undo; undo out of sink clears rating
- [ ] Re-add to Queued after completion works with submission confirm
- [ ] Delete pipeline keeps playlists; memberships closed; rating cleanup correct
- [ ] Play stage playlist uses existing playback engine

---

## 13. Deferred to iteration 3+

| Feature | Notes |
|---------|-------|
| **Smart queue** | Playlist playback mode; pipeline-agnostic |
| **Custom pipeline editor** | Multiple sources, custom graphs; sink `outcomeRating` optional |
| **Workflow pipelines** | No auto-rate; coexist with evaluation |
| **Pipeline summary row** | Beyond collapsible group |
| **Rating history** | `AlbumRatingEvent` audit trail |

---

## Appendix — Relationship to iteration 1 Appendix A

Iteration 1 Appendix A defined the pipeline **schema sketch**. This document is the **build spec** for the first slice of that vision (evaluation template only). Custom pipeline features listed in the old “Iteration 2 features (not scheduled here)” list are rescheduled to iteration 3 unless marked above.
