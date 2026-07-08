export function lastfmAlbumUrl(artist: string, album: string): string {
  return `https://www.last.fm/music/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`
}

export function rymSearchUrl(artist: string, album: string): string {
  return `https://rateyourmusic.com/search?searchterm=${encodeURIComponent(`${artist} ${album}`)}`
}
