export interface P07Review { version: number | null; decision: 'approved_internal' | 'returned'; reviewedAt: string }
/** Match authoritative latest-review semantics, including a returned review tied at the latest time. */
export function p07ReviewCurrent(version: number, latestVersion: number, reviews: readonly P07Review[]): boolean {
  if (version !== latestVersion) return false;
  const here = reviews.filter(item => item.version === version);
  const latest = [...here].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
  return !!latest && latest.decision === 'approved_internal' && !here.some(item => item.reviewedAt === latest.reviewedAt && item.decision === 'returned');
}
