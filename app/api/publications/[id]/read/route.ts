import { postPublicationRead } from '@/lib/intelligence/publication-feed-http';
import { publicationMember } from '@/lib/intelligence/publication-server';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 return postPublicationRead(req,(await params).id,publicationMember);
}
