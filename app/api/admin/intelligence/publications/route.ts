import { NextResponse } from 'next/server';
import { postPublication } from '@/lib/intelligence/publication-http';
import { publicationAdmin, publicationOverview } from '@/lib/intelligence/publication-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'private, no-store' };
export async function GET() {
  try {
    const { db, status } = await publicationAdmin();
    if (status !== 200) return NextResponse.json({ error: 'دسترسی داخلی لازم است.' }, { status, headers });
    return NextResponse.json(await publicationOverview(db), { headers });
  } catch { return NextResponse.json({ error: 'دفتر انتشار در دسترس نیست.', state: 'unavailable' }, { status: 503, headers }); }
}
export async function POST(req: Request) {
  return postPublication(req,async()=>{const {db,status}=await publicationAdmin();return {status,rpc:async(name,args)=>{const {data,error}=await db.rpc(name,args);return {data,error};}};});
}
