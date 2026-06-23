import { createHash } from 'node:crypto'

export function signLastfmParams(
  params: Record<string, string>,
  sharedSecret: string,
): string {
  const sorted = Object.keys(params)
    .filter((key) => key !== 'format' && key !== 'callback')
    .sort()
    .map((key) => key + params[key])
    .join('')
  return createHash('md5').update(sorted + sharedSecret, 'utf8').digest('hex')
}

export function withLastfmSignature(
  params: Record<string, string>,
  sharedSecret: string,
): Record<string, string> {
  return {
    ...params,
    api_sig: signLastfmParams(params, sharedSecret),
  }
}
