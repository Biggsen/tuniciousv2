import type { Album, Artist } from '@/types/library'
import type { ArtistResolveContext } from '@/types/youtube'

export function buildArtistResolveContext(
  album: Album,
  primaryArtist: Artist | null,
): ArtistResolveContext {
  return {
    artistId: album.artistId,
    artistDisplay: album.artist,
    preferredChannelId: primaryArtist?.preferredYouTubeChannelId,
    preferredChannelTitle: primaryArtist?.preferredYouTubeChannelTitle,
  }
}
