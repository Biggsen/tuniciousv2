# v1 migration — 10-minute smoke test

**Scope:** `new` funnel, albums you already applied.  
**Result:** Passed 2026-07-16 (personal cutover complete).

Pick **3 albums** you know from v1 (one still in funnel, one on a sink, one with multi-stage history).

---

## 1. Migration page (1 min)

- [x] `/migration` → `applied` count looks right
- [x] **Apply mapped** again → no new memberships (0 or “nothing to apply”)

## 2. Album timeline (3 min)

For each of the 3 albums, open `/album/:id`:

- [x] **Pipeline history** section shows stages in order (oldest → newest)
- [x] Last row is **current** (or all closed if left funnel)
- [x] Dates look like v1, not “today only”

**Fail if:** wrong stage name, wrong order, or multiple “current” rows.

## 3. Playlist (2 min)

Open the stage playlist where one album should live (e.g. Curious, 1★):

- [x] Album is on that playlist
- [x] Workflow buttons appear (Start / Yes / No as expected)

## 4. One live move + undo (3 min)

On **one** migrated album you don’t care about:

- [x] Click **Yes** or **No** → album moves; history gains one closed + one open row on album page
- [x] **Undo** → prior open row restored (no duplicate current stage)

## 5. Control (1 min)

Pick an album **not** in v1 export:

- [x] Add to Queued → Start works once (organic pipeline still OK)

---

## Pass

All boxes checked for the 3 sample albums + control.

## If something fails

Note: `v1AlbumId`, album title, expected stage vs actual. Compare album page history to v1 export `playlistHistory` for that album.
