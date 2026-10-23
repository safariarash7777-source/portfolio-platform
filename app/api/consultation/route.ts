import { createClient } from "@/lib/supabase/server";
import { consultationDb, getConsultation, postConsultation } from "@/lib/consultation/server";
export const dynamic = "force-dynamic";
const connect = async () => consultationDb(await createClient());
export async function GET(request: Request) { return getConsultation(request, connect); }
export async function POST(request: Request) { return postConsultation(request, connect); }
