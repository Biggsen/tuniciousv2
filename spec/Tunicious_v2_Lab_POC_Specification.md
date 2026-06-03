# Tunicious v2 Lab - Implementation Specification

## Purpose

Tunicious v2 Lab is a disposable local proof-of-concept application used to validate the core architecture of a MusicBrainz-first, Spotify-independent Tunicious rebuild.

The objective is not to create production software.

The objective is to validate architectural assumptions through working software.

The lab exists to validate:

- MusicBrainz identity modelling
- Release selection and track importing
- Playback source resolution
- Playback abstraction
- Session tracking
- Last.fm integration
- Migration feasibility

Once these assumptions have been validated, Tunicious v2 should be built separately.

The lab should not gradually evolve into the production application.

---

# Technology Stack

## Frontend

- Vue 3
- TypeScript
- Vite
- Tailwind
- Pinia

Reasoning:

- Matches existing Tunicious experience
- Fast iteration
- Familiar development workflow

---

## Persistence

The lab must start local-first.

Early persistence should use:

- localStorage
- JSON files
- Mock services where appropriate

The goal is to keep the project experimental and disposable.

Firebase should not be introduced until the core architecture has been proven.

---

## External Services

### MusicBrainz

Primary metadata source.

Responsibilities:

- Artist search
- Album search
- Release groups
- Releases
- Tracklists

### YouTube

Playback source.

Responsibilities:

- Search tracks
- Resolve playable media
- Store video mappings

### Last.fm

Listening authority.

Responsibilities:

- Authentication
- Now Playing
- Scrobbling
- Playcount synchronisation

---

# Build Order

The order is important.

Do not build authentication first.

Do not build Firebase first.

Start with identity.

---

## Phase 1

MusicBrainz Explorer

Goal:

Prove album identity model.

Deliverables:

- Artist search
- Album search
- Release group view
- Release view
- Tracklist view

Questions:

- Does MusicBrainz contain the albums you need?
- Are release groups sufficient?
- How should IDs be stored?

---

## Phase 2

Local Album Database

Goal:

Create Tunicious-owned album records.

Deliverables:

- Import album
- Import release
- Import tracks
- Store locally

Questions:

- Does the model support current Tunicious requirements?
- Are additional fields required?

---

## Phase 3

YouTube Resolution Layer

Goal:

Validate playback source mapping.

Deliverables:

- Resolve tracks
- Cache mappings
- Manual override tools

Validation:

- Match accuracy
- Match consistency
- Cache strategy

---

## Phase 4

Playback Engine

Goal:

Validate Spotify-free playback.

Deliverables:

- Play track
- Pause
- Resume
- Skip
- Queue handling

Important:

Playback is considered a higher migration risk than queue generation and should be validated earlier.

---

## Phase 5

Session Tracking

Goal:

Validate Tunicious-owned listening telemetry.

Deliverables:

- Playback session creation
- Playback session completion
- Elapsed time tracking
- Completion tracking

Validation:

- Session accuracy
- Skip handling
- Resume handling

---

## Phase 6

Last.fm Integration

Goal:

Validate scrobbling model.

Deliverables:

- Login
- Now Playing
- Scrobbling
- Refresh playcounts

Validation:

- Correct thresholds
- Correct timestamps
- Correct track matching

---

## Phase 7

Migration Tooling

Goal:

Validate migration from current Tunicious.

Deliverables:

- Import Spotify-derived albums
- Match MusicBrainz releases
- Identify unmatched albums
- Produce migration report

Rule:

Spotify IDs are temporary migration aids only.

---

## Phase 8

Queue Laboratory

Goal:

Validate queue behaviour.

Deliverables:

- Create stages
- Add albums
- Assign playcounts
- Generate queue

Validation:

- Round robin behaviour
- Least played ordering
- Snapshot behaviour
- Exhausted album behaviour

Queue logic remains important, but it is not considered a primary migration risk.

---

# Screens

## Screen 1

MusicBrainz Explorer

## Screen 2

Album Database

## Screen 3

Playback Laboratory

## Screen 4

Migration Laboratory

## Screen 5

Queue Laboratory

---

# Exit Criteria

The lab is complete when:

- MusicBrainz identity model is proven
- Release model is proven
- YouTube playback resolution is proven
- Playback abstraction is proven
- Session tracking is proven
- Last.fm integration is proven
- Migration path is proven

Only then should Tunicious v2 development begin.
