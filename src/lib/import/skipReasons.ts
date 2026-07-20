import type { ImportSkipReason } from '@/lib/import/types'

export const IMPORT_SKIP_REASONS: Array<{
  value: ImportSkipReason
  label: string
  hint: string
}> = [
  {
    value: 'edition-not-listed',
    label: 'Edition not in MusicBrainz list',
    hint: 'The right release wasn’t among the editions for that artist / release group. Optionally link the library album you used instead.',
  },
  {
    value: 'artist-not-on-mb',
    label: 'Artist not on MusicBrainz',
    hint: 'No usable MusicBrainz artist match for this export row.',
  },
  {
    value: 'other',
    label: 'Other',
    hint: 'Add a short note if useful.',
  },
]

export function importSkipReasonLabel(reason: ImportSkipReason | undefined): string {
  if (!reason) return 'Skipped'
  return IMPORT_SKIP_REASONS.find((item) => item.value === reason)?.label ?? 'Skipped'
}
