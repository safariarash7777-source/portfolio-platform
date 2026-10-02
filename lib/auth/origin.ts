/** Public Auth redirects use deployment configuration, never proxy-supplied headers.
 * Request origin remains the local/unconfigured development fallback.
 */
export function authOrigin(requestUrl: string): string {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? requestUrl)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid Auth application origin')
  }
  return url.origin
}
