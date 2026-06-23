import { formatArtistCredit } from '@/lib/musicbrainz/format'
import type { MbArtistCredit } from '@/lib/musicbrainz/types'
import { normalizeArtistName } from '@/lib/artist/normalize'
import type { Artist } from '@/types/library'

export interface ArtistSeedInput {
  name: string
  sortName?: string
  artistMbid?: string
}

export function artistSeedsFromCredits(
  credits: MbArtistCredit[] | undefined,
): ArtistSeedInput[] {
  if (!credits?.length) {
    return [{ name: 'Unknown artist' }]
  }

  return credits.map((credit) => ({
    name: credit.name,
    sortName: credit.artist['sort-name'],
    artistMbid: credit.artist.id,
  }))
}

export function formatAlbumArtistDisplay(credits: MbArtistCredit[] | undefined): string {
  return formatArtistCredit(credits)
}

export function artistDedupeKey(seed: ArtistSeedInput): string {
  if (seed.artistMbid) {
    return `mbid:${seed.artistMbid}`
  }
  return `name:${normalizeArtistName(seed.name)}`
}

export function toArtistDocumentFields(
  artist: Omit<Artist, 'importedAt'>,
): Omit<Artist, 'importedAt'> {
  return {
    id: artist.id,
    name: artist.name,
    sortName: artist.sortName,
    artistMbid: artist.artistMbid,
    scrobbleName: artist.scrobbleName,
    nameLower: artist.nameLower,
  }
}
