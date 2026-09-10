function encodeLastfmPathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%20/g, '+')
}

export function lastfmAlbumUrl(artist: string, album: string, username?: string): string {
  const artistSeg = encodeLastfmPathSegment(artist)
  const albumSeg = encodeLastfmPathSegment(album)
  if (username) {
    return `https://www.last.fm/user/${encodeURIComponent(username)}/library/music/${artistSeg}/${albumSeg}`
  }
  return `https://www.last.fm/music/${artistSeg}/${albumSeg}`
}

export function rymSearchUrl(artist: string, album: string): string {
  return `https://rateyourmusic.com/search?searchterm=${encodeURIComponent(`${artist} ${album}`)}`
}
