/** Release stop for NEW consultation writers only. This is never service authority.
 * Only the server deployment environment supplies this value. Missing/unknown
 * values close new writes; GET/history/recovery remain available when closed.
 * Product DB consent/right/CAS checks remain mandatory even after release.
 */
export function consultationWritesReleased(): boolean {
  return process.env.CONSULTATION_P03_WRITES_RELEASE === "reader-compatible-v1";
}
