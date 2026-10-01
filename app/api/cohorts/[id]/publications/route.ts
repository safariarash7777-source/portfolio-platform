import { getPublicationFeed } from '@/lib/intelligence/publication-feed-http';
import { publicationMember } from '@/lib/intelligence/publication-server';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
 return getPublicationFeed(req,(await params).id,publicationMember);
}
