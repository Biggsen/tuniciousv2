import { computed } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { resolveMusicBrainzUserAgent } from '@/lib/musicbrainz/userAgent'

export function useMusicBrainzUserAgent() {
  const auth = useAuthStore()

  const userAgent = computed(() =>
    resolveMusicBrainzUserAgent(auth.profile?.settings.musicbrainzUserAgent),
  )

  return { userAgent }
}
