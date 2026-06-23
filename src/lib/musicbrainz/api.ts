import { musicBrainzFetch } from '@/lib/musicbrainz/client'
import type {
  MbArtistDetail,
  MbArtistSearchResult,
  MbReleaseGroupDetail,
  MbReleaseGroupSearchResult,
  MbReleaseDetail,
  MbSearchResponse,
} from '@/lib/musicbrainz/types'

const SEARCH_LIMIT = 25

function searchParams(query: Record<string, string>): string {
  return new URLSearchParams({ fmt: 'json', ...query }).toString()
}

export async function searchArtists(
  term: string,
  userAgent?: string,
): Promise<MbArtistSearchResult[]> {
  const data = await musicBrainzFetch<MbSearchResponse<MbArtistSearchResult>>(
    `artist?${searchParams({ query: term, limit: String(SEARCH_LIMIT) })}`,
    userAgent,
  )
  return data.artists ?? []
}

export async function searchReleaseGroups(
  term: string,
  userAgent?: string,
): Promise<MbReleaseGroupSearchResult[]> {
  const data = await musicBrainzFetch<MbSearchResponse<MbReleaseGroupSearchResult>>(
    `release-group?${searchParams({ query: term, limit: String(SEARCH_LIMIT) })}`,
    userAgent,
  )
  return data['release-groups'] ?? []
}

export async function getArtist(mbid: string, userAgent?: string): Promise<MbArtistDetail> {
  return musicBrainzFetch<MbArtistDetail>(
    `artist/${mbid}?${searchParams({ inc: 'release-groups' })}`,
    userAgent,
  )
}

export async function getReleaseGroup(
  mbid: string,
  userAgent?: string,
): Promise<MbReleaseGroupDetail> {
  return musicBrainzFetch<MbReleaseGroupDetail>(
    `release-group/${mbid}?${searchParams({ inc: 'releases+artist-credits' })}`,
    userAgent,
  )
}

export async function getRelease(mbid: string, userAgent?: string): Promise<MbReleaseDetail> {
  return musicBrainzFetch<MbReleaseDetail>(
    `release/${mbid}?${searchParams({ inc: 'recordings+artist-credits+release-groups' })}`,
    userAgent,
  )
}
