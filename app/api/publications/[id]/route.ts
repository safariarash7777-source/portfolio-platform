import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicationId } from '@/lib/intelligence/publication';
import { getScopedPublication } from '@/lib/intelligence/publication-feed-http';
import { publicationMember } from '@/lib/intelligence/publication-server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'cache-control': 'private, no-store' };
  let id: string;
  try { id = publicationId((await params).id); } catch { return NextResponse.json({ error: 'محتوا در دسترس نیست.' }, { status: 404, headers }); }
  if(new URL(req.url).searchParams.has('cohort')) return getScopedPublication(req,id,publicationMember);
  try {
    const db = await createClient();
    const { data, error } = await db.rpc('read_research_publication', { p_version: id });
    if (error) return NextResponse.json({ error: 'دریافت محتوا انجام نشد.' }, { status: 503, headers });
    return data ? NextResponse.json({ data, contractVersion: 'publication.v1' }, { headers }) : NextResponse.json({ error: 'محتوا در دسترس نیست.' }, { status: 404, headers });
  } catch { return NextResponse.json({ error: 'دریافت محتوا انجام نشد.' }, { status: 503, headers }); }
}
