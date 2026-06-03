
# Tunicious Behaviour Spec (Revised)

## Core Philosophy
Tunicious is an album‑centric listening pipeline. Albums move through user‑defined stages inside user‑defined pipelines. Listening behaviour informs the experience, but the user remains in control of structure and progression.

Last.fm is treated as the **authoritative source for playcounts**, while Tunicious maintains a local cache for performance and queue logic.

---

# 1. Core Entities

## Canonical Album
Represents the underlying musical work.

A canonical album may have multiple releases/editions beneath it.

Example:

Album: In Rainbows  
Releases:
- Standard
- Deluxe
- Remastered

The canonical album is the primary identity inside Tunicious.

---

## Release
A release represents a concrete tracklist version of a canonical album.

Example differences may include:
- deluxe tracks
- remasters
- bonus discs
- alternate track ordering

When a user adds an album, Tunicious stores:

UserAlbumEntry
- canonicalAlbumId
- releaseId

The release chosen at add‑time is **immutable**.

Users shape their effective album version via **excluded tracks**, not by switching releases later.

---

## User Album Entry
Each user can have only **one entry per canonical album**.

Unique key:

(userId, canonicalAlbumId)

Structure:

UserAlbumEntry
- canonicalAlbumId
- releaseId
- excludedTrackIds[]
- trackStats{}
- stageMembershipHistory[]

---

# 2. Effective Album Definition

Users may exclude tracks from an album.

Excluded tracks are stored on the user album entry.

Example:

excludedTrackIds[]

Excluded tracks:

- are removed from playback eligibility
- are removed from queue logic
- reshape the effective album tracklist
- affect album duration and progress calculations

Excluded tracks are **hidden from the main UI tracklist** but accessible via a secondary interface (e.g. “Excluded Tracks”).

Effective tracklist:

effectiveTracks = releaseTracks − excludedTrackIds

---

# 3. Playcount Model

Tunicious stores explicit **per‑user per‑track playcounts**.

However:

Last.fm is the **source of truth**.

Tunicious stores playcounts only as a **local cached mirror** for:

- queue logic
- sorting
- performance

When Last.fm data is refreshed:

Tunicious **fully overwrites** cached playcounts with Last.fm values.

Temporary divergence during playback is expected and acceptable.

---

# 4. Pipelines

Users define their own pipelines.

A pipeline is an ordered sequence of stages.

Example:

Pipeline: Album Discovery

1. Backlog
2. Evaluation
3. Approved
4. Archive

Stages are **not predefined by the system**.

Pipelines may optionally be flagged as:

ratingPipeline = true

Implicit album ratings derive from stage placement within rating pipelines.

---

# 5. Stage Rules

A stage belongs to exactly **one pipeline**.

Stages cannot be shared across pipelines.

Albums cannot appear more than once in a pipeline.

Constraint:

unique(userId, pipelineId, canonicalAlbumId)

Albums may appear in multiple pipelines simultaneously.

If an album appears in more than one rating pipeline, its implicit rating becomes **undefined**.

---

# 6. Stage History

Album stage membership is **append‑only history**.

Each membership record includes:

- stageId
- addedAt
- removedAt

When an album moves stages:

1. previous membership receives removedAt
2. new membership record is created

This history is fundamental to Tunicious’ experience.

---

# 7. Stage Transitions

Stage transitions are **always user‑driven**.

Listening progress does not automatically move albums between stages.

The system never performs automatic stage transitions.

---

# 8. Queue Session

A queue session exists **only when playback begins from a multi‑album stage**.

Single album playback or ad‑hoc playback does not create a queue session.

Session contains:

- stageId
- albumSnapshot[]
- internalQueue[]
- usedCountPerAlbum[]

---

# 9. Stage Snapshot

When playback starts:

Tunicious captures a **snapshot of albums in the stage**.

Albums added or removed later do not affect the current session.

Changes only affect future sessions.

---

# 10. Queue Generation

Queue generation uses round‑robin album traversal.

Example stage order:

A  
B  
C  

Queue pattern:

A1  
B1  
C1  
A2  
B2  
C2

Album traversal follows the **stage’s album order**.

---

# 11. Track Selection

Within an album:

Tracks are ranked by:

1. playcount ASC
2. track order ASC

Next track index is determined by:

usedCountPerAlbum[albumIndex]

This guarantees deterministic progression through:

least played  
→ second least played  
→ third least played

---

# 12. Eligible Tracks

Eligible tracks are determined by:

eligibleTracks = releaseTracks − excludedTrackIds

Only eligible tracks participate in queue logic.

If an album runs out of eligible tracks for the session, it stops contributing tracks.

---

# 13. Session Usage Tracking

A track becomes “used in session” **when it is queued**.

Used tracks remain used for the remainder of the session.

Tracks removed from the queue are not re‑eligible.

---

# 14. Queue Window

Tunicious maintains a continuously generated sequence.

The player exposes only a sliding window (e.g. next 10 tracks).

Internally, the session generator continues producing tracks beyond the visible queue.

---

# 15. External Playback Interruption

If the user manually plays a track whose album is not in the session’s stage snapshot:

The session is **cleared immediately**.

This manual playback is treated as an external interruption.

It does not modify session state.

---

# 16. Track Completion Behaviour

Two separate signals exist:

Last.fm scrobble:
- triggered at scrobble threshold

Tunicious completion:
- triggered when track finishes playback

If a track reaches the scrobble threshold but is skipped before completion:

- Last.fm scrobble occurs
- Tunicious playcount does not increment

---

# 17. Design Principles

Key invariants:

- One album entry per canonical album per user
- One stage membership per pipeline at a time
- Pipelines and stages are user‑defined
- Stage history is append‑only
- Last.fm remains the authoritative playcount source
- Tunicious stores cached playcounts for behaviour and performance
- Queue logic operates on least‑played track ordering
