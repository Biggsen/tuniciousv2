export interface YouTubePlayerInstance {
  loadVideoById(videoId: string): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  destroy(): void
}

interface YouTubePlayerOptions {
  height?: string | number
  width?: string | number
  videoId?: string
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: { target: YouTubePlayerInstance }) => void
    onStateChange?: (event: { data: number; target: YouTubePlayerInstance }) => void
    onError?: (event: { data: number }) => void
  }
}

interface YouTubePlayerConstructor {
  new (elementId: string, options: YouTubePlayerOptions): YouTubePlayerInstance
}

interface YouTubeIframeApi {
  Player: YouTubePlayerConstructor
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YouTubeIframeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

export const YT_PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const

let loadPromise: Promise<YouTubeIframeApi> | null = null

export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const previousReady = window.onYouTubeIframeAPIReady

      window.onYouTubeIframeAPIReady = () => {
        previousReady?.()
        if (window.YT?.Player) {
          resolve(window.YT)
          return
        }
        reject(new Error('YouTube IFrame API failed to load'))
      }

      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
      if (!existing) {
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        script.async = true
        document.head.appendChild(script)
      }
    })
  }

  return loadPromise
}
