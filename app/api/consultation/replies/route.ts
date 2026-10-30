import { createClient } from "@/lib/supabase/server";
import { replyDb, getReplies, postReply } from "@/lib/consultation/repliesServer";
export const dynamic = "force-dynamic";
const connect = async () => replyDb(await createClient());
export async function GET(request: Request) { return getReplies(request, connect); }
export async function POST(request: Request) { return postReply(request, connect); }
