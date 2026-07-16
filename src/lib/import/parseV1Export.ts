import type { StagedAlbum } from '@/lib/import/types'

/** Default New Queued Spotify playlist id from v1 pipeline export. */
export const V1_NEW_QUEUED_PLAYLIST_ID = '50mWTRVvyIC3lUjTJ3r5KV'

export interface V1ExportPlaylistHistoryEntry {
  playlistId: string
  addedAt?: string
  removedAt?: string | null
  playlistName?: string
  type?: string
  pipelineRole?: string
  [key: string]: unknown
}

export interface V1ExportAlbum {
  v1AlbumId: string
  albumTitle: string
  artistName: string
  releaseYear?: string
  albumCover?: string
  playlistHistory?: V1ExportPlaylistHistoryEntry[]
}

export interface V1ExportOpenPlaylist {
  playlistId: string
  playlistName: string
  albumCount: number
}

function albumUriForV1(v1AlbumId: string): string {
  return `v1:${v1AlbumId}`
}

function isOpenOnPlaylist(
  history: V1ExportPlaylistHistoryEntry[] | undefined,
  playlistId: string,
): boolean {
  if (!history?.length) return false
  return history.some((entry) => entry.playlistId === playlistId && entry.removedAt == null)
}

export function listOpenPlaylistsFromV1Export(albums: V1ExportAlbum[]): V1ExportOpenPlaylist[] {
  const meta = new Map<string, { name: string; albumIds: Set<string> }>()

  for (const album of albums) {
    if (!album.v1AlbumId) continue
    const seen = new Set<string>()
    for (const entry of album.playlistHistory ?? []) {
      if (entry.removedAt != null || !entry.playlistId || seen.has(entry.playlistId)) continue
      seen.add(entry.playlistId)
      const existing = meta.get(entry.playlistId)
      if (existing) {
        existing.albumIds.add(album.v1AlbumId)
        if (entry.playlistName?.trim()) existing.name = entry.playlistName.trim()
      } else {
        meta.set(entry.playlistId, {
          name: entry.playlistName?.trim() || entry.playlistId,
          albumIds: new Set([album.v1AlbumId]),
        })
      }
    }
  }

  return [...meta.entries()]
    .map(([playlistId, value]) => ({
      playlistId,
      playlistName: value.name,
      albumCount: value.albumIds.size,
    }))
    .sort(
      (a, b) =>
        a.playlistName.localeCompare(b.playlistName) || a.playlistId.localeCompare(b.playlistId),
    )
}

export function parseV1ExportAlbums(
  albums: V1ExportAlbum[],
  v1PlaylistId: string,
): StagedAlbum[] {
  const staged: StagedAlbum[] = []

  for (const album of albums) {
    if (!album.v1AlbumId || !isOpenOnPlaylist(album.playlistHistory, v1PlaylistId)) continue

    const albumUri = albumUriForV1(album.v1AlbumId)
    staged.push({
      id: albumUri,
      albumUri,
      albumName: album.albumTitle?.trim() || 'Unknown album',
      albumArtist: album.artistName?.trim() || 'Unknown artist',
      releaseDate: album.releaseYear?.trim() || undefined,
      imageUrl: album.albumCover?.trim() || undefined,
      tracks: [],
      status: 'pending',
      source: 'v1',
    })
  }

  return staged.sort(
    (a, b) => a.albumArtist.localeCompare(b.albumArtist) || a.albumName.localeCompare(b.albumName),
  )
}

export function parseV1ExportJson(text: string): V1ExportAlbum[] {
  const data = JSON.parse(text) as unknown
  if (!Array.isArray(data)) {
    throw new Error('v1 export must be a JSON array of albums')
  }
  return data as V1ExportAlbum[]
}

/** Prefer New Queued when present; otherwise first open playlist by name. */
export function defaultV1PlaylistId(playlists: V1ExportOpenPlaylist[]): string | null {
  if (!playlists.length) return null
  const queued = playlists.find(
    (playlist) =>
      playlist.playlistId === V1_NEW_QUEUED_PLAYLIST_ID ||
      /^new\s+queued$/i.test(playlist.playlistName),
  )
  return queued?.playlistId ?? playlists[0].playlistId
}

/** Strip funnel prefix for sync playlist matching (e.g. "New Queued" → "Queued"). */
export function syncPlaylistHintFromV1Name(playlistName: string): string {
  const trimmed = playlistName.trim()
  const match = trimmed.match(/^(?:new|known)\s+(.+)$/i)
  return match?.[1]?.trim() || trimmed
}
