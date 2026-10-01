import { NextResponse } from 'next/server';
import { publicationAdmin } from '@/lib/intelligence/publication-server';
import { publicationId } from '@/lib/intelligence/publication';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const headers = { 'cache-control': 'private, no-store' };
  try {
    const { db, status } = await publicationAdmin();
    if (status !== 200) return NextResponse.json({ error: 'دسترسی داخلی لازم است.' }, { status, headers });
    let cohort: string; try { cohort = publicationId(new URL(req.url).searchParams.get('cohort')); } catch { return NextResponse.json({ error: 'دوره را انتخاب کنید.' }, { status: 422, headers }); }
    const { data, error } = await db.rpc('seasonal_assessment_summary', { p_cohort: cohort });
    if (error || !data) return NextResponse.json({ state: 'unavailable', data: null, error: 'پرسش‌ها و نیازهای دوره هنوز قابل دریافت نیستند.' }, { status: 503, headers });
    return NextResponse.json({ state: 'available', data, contractVersion: 'seasonal.v0.1' }, { headers });
  } catch { return NextResponse.json({ state: 'unavailable', data: null }, { status: 503, headers }); }
}
